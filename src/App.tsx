import React, { useState, useEffect } from 'react'
import { ChessBoard } from './components/ChessBoard'
import { EngineTest } from './components/EngineTest'
import { PlayComputer } from './components/PlayComputer'
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom'
import './App.css'
import { useStockfish, EvaluationResult } from './hooks/useStockfish.ts'
import { Chess, PieceSymbol, Square } from 'chess.js'
import { Chessboard } from 'react-chessboard'

// Helper function for delays
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to get evaluation emoji
const getEvaluationEmoji = (evaluation: EvaluationResult | null): string => {
  if (!evaluation) return ''; // Nothing if not evaluated

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

  // All other cases (slight advantage, unknown score without mate, evaluating) return empty string
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
  // Revert to standard starting FEN
  const [currentFen, setCurrentFen] = useState<string>('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
  const [kingEvaluationResults, setKingEvaluationResults] = useState<Record<string, string>>({})
  const [isEvaluatingKings, setIsEvaluatingKings] = useState<boolean>(false)
  const [orientation, setOrientation] = useState<'white' | 'black'>('white')

  const {
    isReady: engineReady,
    evaluateFen
  } = useStockfish()

  useEffect(() => {
    if (engineReady) {
      console.log("App: Engine is ready.");
      // No need to send commands here anymore
    } else {
      console.log("App: Engine is not ready yet.");
    }
  }, [engineReady]); // Just log readiness state change

  const handlePositionChange = (fen: string) => {
    setCurrentFen(fen)
    setKingEvaluationResults({})
    // Determine orientation based on whose turn it is
    const turn = fen.split(' ')[1];
    setOrientation(turn === 'w' ? 'white' : 'black');
  }

  const handleEvaluateKingPositions = async () => {
    const fenParts = currentFen.split(' ');
    const piecePlacement = fenParts[0];
    const whiteKings = (piecePlacement.match(/K/g) || []).length;
    const blackKings = (piecePlacement.match(/k/g) || []).length;

    if (whiteKings + blackKings !== 1) {
        alert("King evaluation requires exactly one king (either white OR black) to be present on the board.");
        console.error("Evaluation requires exactly one king on the board. Found:", { whiteKings, blackKings });
        return;
    }

    // Check engine readiness and if already evaluating
    if (!engineReady || isEvaluatingKings) {
      console.warn(`Cannot evaluate kings: Engine ready: ${engineReady}, Already evaluating: ${isEvaluatingKings}`);
      return;
    }

    // Ensure evaluateFen is available (defensive check)
    if (!evaluateFen) {
        console.error("Cannot evaluate kings: evaluateFen function is not available from the hook.");
        return;
    }

    setIsEvaluatingKings(true);
    setKingEvaluationResults({}); // Clear previous results

    try {
      console.log("Starting king evaluation for FEN:", currentFen);

      const game = new Chess(); // Use chess.js for parsing and setup
      game.clear();
      const piecesToPlace: { square: Square; piece: { type: PieceSymbol; color: 'w' | 'b' } }[] = [];
      let file = 0;
      let rank = 7;
      let existingKingSquare: Square | null = null;
      let existingKingColor: 'w' | 'b' | null = null;
      const turn = fenParts[1] as 'w' | 'b' || 'w'; // Get turn from FEN

      for (const char of piecePlacement) {
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

      console.log(`Evaluating possible squares for the ${missingKingColor === 'w' ? 'White' : 'Black'} king...`);

      // --- Simplified Evaluation loop --- 
      for (const square of allSquares) {
          if (game.get(square) || square === existingKingSquare) continue; // Skip occupied squares or the existing king's square

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

          console.log(`Evaluating square ${square} (FEN: ${tempFen})...`);

          // --- Core change: Use the hook's promise-based evaluation --- 
          try {
              const evaluation = await evaluateFen(tempFen, 1000); // Wait for the hook to finish
              const emoji = getEvaluationEmoji(evaluation);
              console.log(`  Result for ${square}:`, evaluation, `-> Emoji: ${emoji}`);
              setKingEvaluationResults(prev => ({ ...prev, [square]: emoji }));
          } catch (evalError) {
              console.error(`  Error evaluating FEN ${tempFen} for square ${square}:`, evalError);
              setKingEvaluationResults(prev => ({ ...prev, [square]: '❌' })); // Mark error on the board
          }
          // REMOVED: Manual wait loops, setThinking, reading appCurrentEvalRef

      } // --- End evaluation loop ---

      console.log("Finished all king evaluations.");

    } catch (error) {
      console.error("An unexpected error occurred during king evaluation:", error);
    } finally {
      setIsEvaluatingKings(false); // Ensure this always runs
      // REMOVED: setThinking(false)
    }
  };

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
                kingEvaluationResults={kingEvaluationResults}
                isEvaluatingKings={isEvaluatingKings}
                onEvaluateKingPositions={handleEvaluateKingPositions}
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

export default App
