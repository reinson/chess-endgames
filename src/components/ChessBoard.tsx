import { useState, useCallback, useEffect, useRef } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess, PieceSymbol, Square } from 'chess.js';
import './ChessBoard.css';
import { EvaluationResult } from '../hooks/useStockfish'; // Import EvaluationResult type

// --- Updated Props Interface ---
interface ChessBoardProps {
  onPositionChange?: (fen: string) => void;
  // Removed: kingEvaluationResults: Record<string, string>;
  kingDetailedEvaluations: Record<string, EvaluationResult | null>; // Accept detailed evaluations per square
  getEvaluationEmoji: (evaluation: EvaluationResult | null | undefined) => string; // Accept emoji helper
  isEvaluatingKings: boolean;
  onEvaluateKingPositions: () => void;
  // --- ADDED: Props for turn ---
  currentTurn: 'w' | 'b';
  onTurnChange: (turn: 'w' | 'b') => void;
  evaluatedFen: string; // <<< ADDED
}

// --- History Storage Type Change --- 
// Type for the main storage object: { [fen]: evaluationMapForThatFen }
// evaluationMapForThatFen: { [square]: detailedEvaluationResult }
type FenHistoryStorage = Record<string, Record<string, EvaluationResult | null>>;

const PIECES = [
  { symbol: '♔', type: 'K' },
  { symbol: '♚', type: 'k' },
  { symbol: '♕', type: 'Q' },
  { symbol: '♛', type: 'q' },
  { symbol: '♖', type: 'R' },
  { symbol: '♜', type: 'r' },
  { symbol: '♗', type: 'B' },
  { symbol: '♝', type: 'b' },
  { symbol: '♘', type: 'N' },
  { symbol: '♞', type: 'n' },
  { symbol: '♙', type: 'P' },
  { symbol: '♟', type: 'p' },
] as const;

// --- Animation Delay --- 
const HISTORY_LOAD_ANIMATION_DELAY_MS = 300; // Adjust as needed (ms)

export function ChessBoard({
  onPositionChange,
  // Removed: kingEvaluationResults,
  kingDetailedEvaluations,
  getEvaluationEmoji,
  isEvaluatingKings,
  onEvaluateKingPositions,
  // --- ADDED: Destructure turn props ---
  currentTurn,
  onTurnChange,
  evaluatedFen // <<< Destructure
}: ChessBoardProps) {
  console.log('[ChessBoard Render] Props received:', { kingDetailedEvaluations, currentTurn, evaluatedFen });

  // --- History State Change: Load/Save the FenHistoryStorage object --- 
  const [historyStorage, setHistoryStorage] = useState<FenHistoryStorage>(() => {
    try {
      const stored = window.localStorage.getItem('fenEvaluationStorage');
      // console.log('[ChessBoard Init] Loaded from localStorage (fenEvaluationStorage):', stored ? JSON.parse(stored) : '<empty>'); // REMOVED
      return stored ? JSON.parse(stored) : {};
    } catch {
      console.error('[ChessBoard Init] Failed to parse fenEvaluationStorage');
      return {};
    }
  });

  // --- Active Evaluation State Change: Holds detailed results per square --- 
  const [activeEvaluation, setActiveEvaluation] = useState<Record<string, EvaluationResult | null>>({});
  // --- State for pending evaluation after history click ---
  const [pendingEvaluation, setPendingEvaluation] = useState<Record<string, EvaluationResult | null> | null>(null);
  // Ref to store the timeout ID for cleanup
  const evaluationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // game, position, selectedPiece state remain the same
  const [game, setGame] = useState(() => {
    const g = new Chess();
    g.clear();
    return g;
  });
  const [position, setPosition] = useState(() => {
    const g = new Chess();
    g.clear();
    const fen = g.fen();
    // console.log('[CB Init] Pos:', fen); // REMOVED
    return fen;
  });
  const [selectedPiece, setSelectedPiece] = useState<string | null>(null);

  const BOARD_WIDTH = 500;
  const SQUARE_SIZE = BOARD_WIDTH / 8;

  const handlePositionChange = useCallback((fen: string) => {
    // console.log('[CB PosChange] FEN:', fen); // REMOVED
    setPosition(fen);
    onPositionChange?.(fen);
  }, [onPositionChange]);

  // --- Effect Change: Save to the new storage structure --- 
  useEffect(() => {
    try {
      const stringifiedData = JSON.stringify(historyStorage);
      // console.log('[ChessBoard Effect - Persist History] Attempting localStorage.setItem (fenEvaluationStorage) with:', stringifiedData); // REMOVED
      window.localStorage.setItem('fenEvaluationStorage', stringifiedData);
      // console.log('[ChessBoard Effect - Persist History] Successfully wrote history to localStorage.'); // REMOVED
    } catch (error) {
      console.error('[ChessBoard Effect - Persist History] Failed to write history to localStorage:', error);
    }
  }, [historyStorage]);

  // --- useEffect for handling NEW evaluations --- 
  useEffect(() => {
    // console.log('[ChessBoard Effect - New Evals] Triggered. Data:', kingDetailedEvaluations, 'Evaluated FEN:', evaluatedFen);

    // --- Use evaluatedFen in guard clause --- 
    if (!evaluatedFen || !kingDetailedEvaluations || Object.keys(kingDetailedEvaluations).length === 0) {
      // console.log('[ChessBoard Effect - New Evals] Condition not met (no evaluated FEN or empty results), skipping history update.');
       if (kingDetailedEvaluations && Object.keys(kingDetailedEvaluations).length > 0) {
         setActiveEvaluation(kingDetailedEvaluations);
      } else if (!kingDetailedEvaluations || Object.keys(kingDetailedEvaluations).length === 0) {
         setActiveEvaluation({});
      }
      return;
    }
    // console.log('[ChessBoard Effect - New Evals] Conditions met. Updating active/history.');
    setActiveEvaluation(kingDetailedEvaluations);

    setHistoryStorage(prevStorage => {
      // --- Use evaluatedFen as the key --- 
      const fenKey = evaluatedFen; 
      if (prevStorage[fenKey] && JSON.stringify(prevStorage[fenKey]) === JSON.stringify(kingDetailedEvaluations)) {
          return prevStorage; 
      }
      // console.log('[ChessBoard Effect - New Evals] Updating historyStorage state for FEN:', fenKey);
      const updatedStorage: FenHistoryStorage = {
        ...prevStorage,
        [fenKey]: kingDetailedEvaluations // Use evaluatedFen as key
      };
      return updatedStorage;
    });
  // --- Add evaluatedFen to dependency array --- 
  }, [kingDetailedEvaluations, evaluatedFen]); 

  // --- useEffect for applying pending evaluation after animation delay ---
  useEffect(() => {
    if (evaluationTimeoutRef.current) {
      clearTimeout(evaluationTimeoutRef.current);
      evaluationTimeoutRef.current = null;
    }
    if (pendingEvaluation) {
      // console.log('[ChessBoard Effect - Apply Pending Eval] Position changed, pending eval found. Setting timeout.'); // REMOVED
      evaluationTimeoutRef.current = setTimeout(() => {
        // console.log('[ChessBoard Effect - Apply Pending Eval] Timeout finished. Applying pending evaluation.'); // REMOVED
        setActiveEvaluation(pendingEvaluation);
        setPendingEvaluation(null); 
        evaluationTimeoutRef.current = null;
      }, HISTORY_LOAD_ANIMATION_DELAY_MS);
    }
    return () => {
        if (evaluationTimeoutRef.current) {
            clearTimeout(evaluationTimeoutRef.current);
            evaluationTimeoutRef.current = null;
        }
    };
  }, [position, pendingEvaluation]);

  // --- ADDED: Delete History Item Handler ---
  const handleDeleteHistoryItem = useCallback((fenToDelete: string, event: React.MouseEvent) => {
    event.stopPropagation();
    // console.log('[ChessBoard Callback] handleDeleteHistoryItem FEN:', fenToDelete); // REMOVED
    setHistoryStorage(prevStorage => {
      const newStorage = { ...prevStorage };
      delete newStorage[fenToDelete];
      // console.log('[ChessBoard Callback] Updated historyStorage after delete:', newStorage); // REMOVED
      return newStorage;
    });
  }, []);

  // --- Modified handleHistoryClick ---
  const handleHistoryClick = useCallback(
    (fen: string) => {
       const evalMap = historyStorage[fen];
       // console.log('[ChessBoard Callback] handleHistoryClick:', { fen, evalMap }); // REMOVED
       setActiveEvaluation({}); 
       setPendingEvaluation(null);
       if (evaluationTimeoutRef.current) {
           clearTimeout(evaluationTimeoutRef.current);
           evaluationTimeoutRef.current = null;
       }
       setPendingEvaluation(evalMap || {});
       setPosition(fen);
       const newGame = new Chess();
       newGame.clear();
       const fenParts = fen.split(' ');
       const boardFen = fenParts[0];
       let file = 0;
       let rank = 7;
       try {
           for (const char of boardFen) {
                if (char === '/') { rank--; file = 0; }
                else if (/\d/.test(char)) { file += parseInt(char); }
                else {
                    const square = `${String.fromCharCode(97 + file)}${rank + 1}` as Square;
                    const color = (char === char.toUpperCase()) ? 'w' : 'b';
                    const type = char.toLowerCase() as PieceSymbol;
                    newGame.put({ type, color }, square);
                    file++;
                }
            }
           setGame(newGame); 
           // console.log("[CB Callback] Manually updated game state from FEN."); // REMOVED
       } catch (manualLoadError) {
            console.error("Error manually placing pieces:", manualLoadError, "FEN:", fen);
           const errorGame = new Chess(); errorGame.clear(); setGame(errorGame);
       }
       onPositionChange?.(fen);
    },
    [onPositionChange, historyStorage]
  );

  // --- Other Callbacks (onSquareClick, etc.) --- 
  // These generally remain the same, ensure handlePositionChange is called correctly
  const onSquareClick = useCallback((square: Square) => {
      // console.log('[CB SquareClick]', square, 'Sel:', selectedPiece); // REMOVED
      setActiveEvaluation({}); 
      setPendingEvaluation(null);
      if (evaluationTimeoutRef.current) { clearTimeout(evaluationTimeoutRef.current); evaluationTimeoutRef.current = null; }

      if (!selectedPiece) {
          const piece = game.get(square);
          if (piece) {
              setSelectedPiece(piece.color === 'w' ? piece.type.toUpperCase() : piece.type.toLowerCase());
              game.remove(square);
              handlePositionChange(game.fen());
          }
          return;
      }
      const existingPiece = game.get(square);
      if (existingPiece) {
          console.warn(`Square ${square} occupied.`); 
          return;
      }
      try {
          const pieceType = selectedPiece;
          const putResult = game.put({ type: pieceType.toLowerCase() as PieceSymbol, color: pieceType === pieceType.toUpperCase() ? 'w' : 'b' }, square);
          if (putResult) { 
              handlePositionChange(game.fen()); 
          } else { 
              console.error("Put fail"); 
              setSelectedPiece(null); 
          }
      } catch (error) { 
          console.error('Put error', error); 
          setSelectedPiece(null); 
      }
  }, [game, selectedPiece, handlePositionChange]);

  const onSquareRightClick = useCallback((square: Square) => {
      // console.log('[CB RightClick]', square); // REMOVED
      setActiveEvaluation({});
      setPendingEvaluation(null);
      if (evaluationTimeoutRef.current) { clearTimeout(evaluationTimeoutRef.current); evaluationTimeoutRef.current = null; }

      try {
          const removeResult = game.remove(square);
          if (removeResult) { handlePositionChange(game.fen()); }
          else { console.warn("Remove empty"); }
      } catch (error) { console.error('Remove error', error); }
  }, [game, handlePositionChange]);

  const onPieceDrop = useCallback((sourceSquare: Square, targetSquare: Square) => {
      // console.log('[CB Drop]', sourceSquare, '->', targetSquare); // REMOVED
      setActiveEvaluation({});
      setPendingEvaluation(null);
      if (evaluationTimeoutRef.current) { clearTimeout(evaluationTimeoutRef.current); evaluationTimeoutRef.current = null; }

      try {
          const piece = game.get(sourceSquare); if (!piece) return false;
          game.remove(sourceSquare);
          const existingPiece = game.get(targetSquare); if (existingPiece) { game.remove(targetSquare); }
          game.put(piece, targetSquare);
          handlePositionChange(game.fen()); return true;
      } catch (error) { console.error('Drop error', error); return false; }
  }, [game, handlePositionChange]);

  const clearBoard = useCallback(() => {
      // console.log('[CB Clear]'); // REMOVED
      const newGame = new Chess(); newGame.clear(); setGame(newGame);
      handlePositionChange(newGame.fen()); setActiveEvaluation({});
  }, [handlePositionChange]);

  console.log('[ChessBoard Render] State before return:', { position, activeEvaluation, pendingEvaluation });
  // --- Render --- 
  return (
    <div className="chess-board-container">
      <div className="board-and-controls" style={{ display: 'flex', alignItems: 'flex-start', gap: '24px' }} >
        {/* Board + Overlay */}
        <div style={{ display: 'flex', flexDirection: 'column', width: BOARD_WIDTH }}>
          <div style={{ position: 'relative', width: BOARD_WIDTH, height: BOARD_WIDTH }}>
            <Chessboard
              position={position}
              onSquareClick={onSquareClick}
              onSquareRightClick={onSquareRightClick}
              onPieceDrop={onPieceDrop}
              boardWidth={BOARD_WIDTH}
            />
            {/* --- Overlay Rendering Change: Use activeEvaluation + getEvaluationEmoji --- */}
            <div className="evaluation-overlays" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', }} >
              {Object.entries(activeEvaluation) // Iterate over detailed results
                  .map(([square, detailedEval]) => { // Get square and its detailed eval
                     const emoji = getEvaluationEmoji(detailedEval); // Convert detail to emoji for display
                     if (!emoji) return null; // Don't render anything if no emoji

                     const fileIndex = square.charCodeAt(0) - 'a'.charCodeAt(0);
                     const rankIndex = 8 - parseInt(square[1]);
                     const top = rankIndex * SQUARE_SIZE;
                     const left = fileIndex * SQUARE_SIZE;
                     return (
                       <div key={square} className="evaluation-emoji" style={{ position: 'absolute', top: `${top}px`, left: `${left}px`, width: `${SQUARE_SIZE}px`, height: `${SQUARE_SIZE}px`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', fontWeight: '500', color: 'rgba(0, 0, 0, 0.75)', zIndex: 2, }} >
                         {emoji} {/* Display the calculated emoji */} 
                       </div>
                     );
                 })
              }
            </div>
          </div>
        </div>

        {/* Piece Buttons & Controls */}
        <div className="piece-buttons">
          {PIECES.map(({ symbol, type }) => ( <div key={`button-${type}`} className={`piece-button ${selectedPiece === type ? 'selected' : ''}`} onClick={() => setSelectedPiece(type)} > {symbol} </div> ))}
          {/* --- ADDED: Turn Selector --- */}
          <div className="turn-selector-container">
            <label className="turn-selector-label">Next to move:</label>
            <div className="turn-selector">
              <div 
                className={`turn-option ${currentTurn === 'w' ? 'selected' : ''}`}
                onClick={() => onTurnChange('w')}
              >
                White {/* Shortened text */}
              </div>
              <div 
                className={`turn-option ${currentTurn === 'b' ? 'selected' : ''}`}
                onClick={() => onTurnChange('b')}
              >
                Black {/* Shortened text */}
              </div>
            </div>
          </div>
          <button onClick={clearBoard} style={{ marginTop: '10px' }} > Clear Board </button>
          <button className="evaluate-button" onClick={onEvaluateKingPositions} disabled={isEvaluatingKings} > {isEvaluatingKings ? 'Evaluating...' : 'Evaluate'} </button>
        </div>

        {/* --- History Sidebar Change: Add delete button --- */}
        <div 
          className="fen-history" 
          style={{ 
            marginLeft: '24px', 
            width: '350px', // Increased width from 200px
            maxHeight: BOARD_WIDTH, 
            overflowY: 'auto', 
            background: '#f8f9fa', 
            padding: '12px', 
            borderRadius: '8px', 
          }} 
        >
          <h3>History</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {/* Get FENs from the keys of the storage object */}
            {Object.keys(historyStorage).map((fenKey) => (
              <li 
                key={fenKey} 
                className="history-item" // Keep class
                // --- Apply bold style conditionally --- 
                style={{ 
                  cursor: 'pointer', 
                  marginBottom: '8px', 
                  wordBreak: 'break-all', 
                  fontSize: '11px',
                  fontWeight: fenKey === position ? 'bold' : 'normal' // Bold if active
                }} 
                onClick={() => handleHistoryClick(fenKey)} // Click li to load
              >
                <code>{fenKey}</code>
                {/* Delete Button (Bin Emoji) */}
                <span 
                  className="delete-btn" 
                  title="Delete this entry" 
                  onClick={(e) => handleDeleteHistoryItem(fenKey, e)} // Click span to delete
                >
                  🗑️
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
} 