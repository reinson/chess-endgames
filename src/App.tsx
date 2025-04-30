import React, { useState, useEffect, useRef } from 'react'
import { ChessBoard } from './components/ChessBoard'
import { EngineTest } from './components/EngineTest'
import { PlayComputer } from './components/PlayComputer'
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom'
import './App.css'
import { useStockfish, EvaluationResult } from './hooks/useStockfish.ts'
import { Chess, PieceSymbol, Square } from 'chess.js'

// Helper function for delays
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to get evaluation emoji
const getEvaluationEmoji = (evaluation: EvaluationResult | null | undefined): string => {
  if (!evaluation) return ''; // Nothing if not evaluated or null/undefined

  // White winning (mate or strong advantage)
  if ((evaluation.mate && evaluation.mate > 0) || (evaluation.score !== undefined && evaluation.score > 200)) {
    return '✅';
  }

  // Black winning (mate or strong advantage)
  if ((evaluation.mate && evaluation.mate < 0) || (evaluation.score !== undefined && evaluation.score < -200)) {
    return '❌';
  }

  // Draw/Even (score is defined and within the drawish range [-50, 50])
  if (evaluation.score !== undefined && evaluation.score >= -50 && evaluation.score <= 50) {
    return '½';
  }

  // All other cases return empty string
  return '';
};

// Helper to create FEN (Assuming this is still useful, otherwise remove)
function createFenFromPieces(pieces: { square: Square; piece: { type: PieceSymbol; color: 'w' | 'b' } }[], turn: 'w' | 'b' = 'w'): string {
  const game = new Chess();
  game.clear();
  pieces.forEach(p => game.put(p.piece, p.square));
  const fen = game.fen();
  // Ensure correct turn in FEN if needed, default chess.js FEN might suffice
  const fenParts = fen.split(' ');
  fenParts[1] = turn; // Set turn
  fenParts[2] = '-'; // No castling rights
  fenParts[3] = '-'; // No en passant
  fenParts[4] = '0'; // No halfmove clock
  fenParts[5] = '1'; // Fullmove number
  return fenParts.join(' ');
}

function App() {
  const cancelEvaluationRef = useRef(false);
  const [currentFen, setCurrentFen] = useState<string>('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
  const [kingEvaluationResults, setKingEvaluationResults] = useState<Record<string, EvaluationResult | null>>({})
  const [isEvaluatingKings, setIsEvaluatingKings] = useState<boolean>(false)
  const [currentTurn, setCurrentTurn] = useState<'w' | 'b'>('w');
  const [orientation, setOrientation] = useState<'white' | 'black'>('white')

  const {
    isReady: engineReady,
    evaluateFen
  } = useStockfish()

  useEffect(() => {
    if (engineReady) {
      // console.log("App: Engine is ready."); // REMOVED
    } else {
      // console.log("App: Engine is not ready yet."); // REMOVED
    }
  }, [engineReady]);

  const handlePositionChange = (fen: string) => {
    if (fen !== currentFen) {
      // console.log("[App] Position changed, clearing evaluations."); // REMOVED
      cancelEvaluationRef.current = true;
      setIsEvaluatingKings(false);
      setKingEvaluationResults({}) 
      setCurrentFen(fen)
      const turn = fen.split(' ')[1] as 'w' | 'b' || 'w';
      setCurrentTurn(turn);
      setOrientation(turn === 'w' ? 'white' : 'black');
    } else {
      const turn = fen.split(' ')[1] as 'w' | 'b' || 'w';
      setCurrentTurn(turn);
      setCurrentFen(fen);
    }
  }

  const handleTurnChange = (newTurn: 'w' | 'b') => {
    // console.log("[App] handleTurnChange called with:", newTurn); // REMOVED
    if (newTurn !== currentTurn) {
      const parts = currentFen.split(' ');
      if (parts.length >= 2) {
          parts[1] = newTurn;
          const newFen = parts.join(' ');
          // console.log("[App] Updating FEN due to turn change:", newFen); // REMOVED
          setCurrentFen(newFen);
          setCurrentTurn(newTurn);
      } else {
          console.error("[App] Cannot change turn, invalid FEN format:", currentFen);
      }
    }
  };

  const handleEvaluateKingPositions = async () => {
    cancelEvaluationRef.current = false;
    setIsEvaluatingKings(true);
    const evaluationForThisFen: Record<string, EvaluationResult | null> = {}; 

    try {
      // console.log("Starting king evaluation for FEN:", currentFen); // REMOVED
      const game = new Chess(); // Use chess.js for parsing and setup
      game.clear();
      const piecesToPlace: { square: Square; piece: { type: PieceSymbol; color: 'w' | 'b' } }[] = [];
      let file = 0;
      let rank = 7;
      let existingKingSquare: Square | null = null;
      let existingKingColor: 'w' | 'b' | null = null;
      const turn = currentFen.split(' ')[1] as 'w' | 'b' || 'w'; // Get turn from FEN

      for (const char of currentFen.split(' ')[0]) {
        if (char === '/') {
          rank--;
          file = 0;
        } else if (/\d/.test(char)) {
          file += parseInt(char);
        } else {
          const square = `${String.fromCharCode(97 + file)}${rank + 1}` as Square;
          const color = (char === char.toUpperCase()) ? 'w' : 'b';
          const type = char.toLowerCase() as PieceSymbol;
          // Use game.put to handle validation implicitly if needed, or just track pieces
          game.put({ type, color }, square);
          piecesToPlace.push({ square, piece: { type, color } });
          if (type === 'k') {
            existingKingSquare = square;
            existingKingColor = color;
          }
          file++;
        }
      }

      if (!existingKingSquare || !existingKingColor) {
          console.error("Logic error: Could not find existing king after parsing FEN.");
          setIsEvaluatingKings(false);
          return;
      }

      // Ensure missingKingColor has the correct type for createFenFromPieces
      const missingKingColor = (existingKingColor === 'w' ? 'b' : 'w') as 'w' | 'b';

      const allSquares = ([] as Square[]).concat(...Array(8).fill(0).map((_, r) => Array(8).fill(0).map((_, f) => `${String.fromCharCode(97 + f)}${8 - r}` as Square)));

      // console.log(`Evaluating possible squares for the ${missingKingColor === 'w' ? 'White' : 'Black'} king...`); // REMOVED

      for (const square of allSquares) {
          // Stop if clear board was clicked
          if (cancelEvaluationRef.current) break;
          if (game.get(square) || square === existingKingSquare) continue;

          // Prevent placing kings adjacent to each other
          const squareFile = square.charCodeAt(0);
          const squareRank = parseInt(square[1]);
          const existingFile = existingKingSquare.charCodeAt(0);
          const existingRank = parseInt(existingKingSquare[1]);
          if (Math.abs(squareFile - existingFile) <= 1 && Math.abs(squareRank - existingRank) <= 1) {
              continue; // Skip adjacent squares
          }

          // Create the temporary position with the second king
          const tempPieces = [...piecesToPlace, { square, piece: { type: 'k' as PieceSymbol, color: missingKingColor } }];
          const tempFen = createFenFromPieces(tempPieces, turn); // Use helper to ensure valid FEN

          try {
              const evaluation = await evaluateFen(tempFen, 1000);
              if (cancelEvaluationRef.current) break;

              // --- ADJUST PERSPECTIVE: Convert score/mate if it was Black's turn in tempFen ---
              let adjustedEvaluation = evaluation; // Start with the raw evaluation
              const turnOfEvaluatedFen = tempFen.split(' ')[1]; // Get turn from the FEN we just evaluated
              
              if (turnOfEvaluatedFen === 'b' && evaluation) {
                  // If Black moved and we got a result, negate score/mate
                  adjustedEvaluation = {
                      ...evaluation,
                      score: evaluation.score !== undefined ? -evaluation.score : undefined,
                      mate: evaluation.mate !== undefined ? -evaluation.mate : undefined,
                  };
                  console.log(`[App Eval Loop] Original eval (Black's turn):`, evaluation, `Adjusted eval (White's perspective):`, adjustedEvaluation);
              } else {
                 // console.log(`[App Eval Loop] Result for ${square} (White's turn):`, evaluation); // Keep original log commented
              }
              
              // --- Store the perspective-adjusted evaluation --- 
              setKingEvaluationResults(prev => ({ ...prev, [square]: adjustedEvaluation })); 
              evaluationForThisFen[square] = adjustedEvaluation; // Also update local collection

          } catch (evalError) {
              console.error(`  Error evaluating FEN ${tempFen} for square ${square}:`, evalError);
              setKingEvaluationResults(prev => ({ ...prev, [square]: null }));
              evaluationForThisFen[square] = null;
          }
      }
      // console.log("Finished all king evaluations."); // Keep removed

    } catch (error) { // Use generic error for outer catch
      console.error("An unexpected error occurred during king evaluation:", error);
    } finally {
      // --- RESTORED: finally block --- 
      setIsEvaluatingKings(false); 
      cancelEvaluationRef.current = false;
    }
  };

  // --- RESTORED: return statement with Router, Routes, ChessBoard etc. --- 
  return (
    <Router basename={import.meta.env.BASE_URL}>
      <div className="app">
        <nav style={{ marginBottom: '10px' }}>
          <Link to="/" style={{ marginRight: '10px' }}>King Positions</Link>
          <Link to="/engine" style={{ marginRight: '10px' }}>Engine Test</Link>
          <Link to="/play">Play vs Computer</Link>
        </nav>

        <Routes>
          <Route path="/play" element={<PlayComputer />} />
          <Route path="/engine" element={<EngineTest />} />
          <Route path="/" element={
            <>
              <ChessBoard
                onPositionChange={handlePositionChange}
                kingDetailedEvaluations={kingEvaluationResults}
                getEvaluationEmoji={getEvaluationEmoji} 
                isEvaluatingKings={isEvaluatingKings}
                onEvaluateKingPositions={handleEvaluateKingPositions}
                currentTurn={currentTurn}
                onTurnChange={handleTurnChange}
                evaluatedFen={currentFen}
              />
              <div className="fen-display" style={{marginTop: '10px'}}>
                <h3>Current Position (FEN):</h3>
                <code style={{wordBreak: 'break-all'}}>{currentFen}</code>
              </div>
            </>
          } />
        </Routes>
      </div>
    </Router>
  )
}

export default App;