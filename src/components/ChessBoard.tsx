import { useState, useCallback, useEffect } from 'react';
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

export function ChessBoard({
  onPositionChange,
  // Removed: kingEvaluationResults,
  kingDetailedEvaluations,
  getEvaluationEmoji,
  isEvaluatingKings,
  onEvaluateKingPositions
}: ChessBoardProps) {
  // Logging props
  console.log('[ChessBoard Render] Received props:', { kingDetailedEvaluations, isEvaluatingKings });

  // --- History State Change: Load/Save the FenHistoryStorage object --- 
  const [historyStorage, setHistoryStorage] = useState<FenHistoryStorage>(() => {
    try {
      const stored = window.localStorage.getItem('fenEvaluationStorage'); // Use a new key
      console.log('[ChessBoard Init] Loaded from localStorage (fenEvaluationStorage):', stored ? JSON.parse(stored) : '<empty>');
      return stored ? JSON.parse(stored) : {}; // Default to empty object
    } catch {
      console.error('[ChessBoard Init] Failed to parse fenEvaluationStorage');
      return {};
    }
  });

  // --- Active Evaluation State Change: Holds detailed results per square --- 
  const [activeEvaluation, setActiveEvaluation] = useState<Record<string, EvaluationResult | null>>({});

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
    console.log('[CB Init] Pos:', fen);
    return fen;
  });
  const [selectedPiece, setSelectedPiece] = useState<string | null>(null);

  const BOARD_WIDTH = 500;
  const SQUARE_SIZE = BOARD_WIDTH / 8;

  const handlePositionChange = useCallback((fen: string) => {
    console.log('[CB PosChange] FEN:', fen);
    setPosition(fen);
    if (onPositionChange) {
        onPositionChange(fen);
    }
  }, [onPositionChange]);

  // --- Effect Change: Save to the new storage structure --- 
  useEffect(() => {
    console.log('[ChessBoard Effect] Triggered. Dependencies:', { kingDetailedEvaluations, position });

    // Guard clause: Use kingDetailedEvaluations prop
    if (!position || !kingDetailedEvaluations || Object.keys(kingDetailedEvaluations).length === 0) {
      console.log('[ChessBoard Effect] Condition not met (no position or empty detailed results), skipping write.');
      // If results ARE present, but position is somehow falsy, make activeEvaluation match results
      if (kingDetailedEvaluations && Object.keys(kingDetailedEvaluations).length > 0) {
          console.log('[ChessBoard Effect] Setting active evaluation from props even though position might be unset.');
          setActiveEvaluation(kingDetailedEvaluations);
      }
      return;
    }

    console.log('[ChessBoard Effect] Conditions met. Updating active evaluation and history storage.');
    // Set the active evaluation for display
    setActiveEvaluation(kingDetailedEvaluations); 

    // Update the persistent history storage object
    setHistoryStorage(prevStorage => {
      const currentFen = position; // Capture position
      console.log('[ChessBoard Effect - setHistoryStorage] Callback running. Current FEN:', currentFen);
      
      // Create the new storage object
      const newStorage: FenHistoryStorage = {
        ...prevStorage,
        [currentFen]: kingDetailedEvaluations // Add/Update the entry for the current FEN
      };

      try {
        const stringifiedData = JSON.stringify(newStorage);
        console.log('[ChessBoard Effect - setHistoryStorage] Attempting localStorage.setItem (fenEvaluationStorage) with:', stringifiedData);
        window.localStorage.setItem('fenEvaluationStorage', stringifiedData); // Use new key
        console.log('[ChessBoard Effect - setHistoryStorage] Successfully wrote to localStorage.');
      } catch (error) {
        console.error('[ChessBoard Effect - setHistoryStorage] Failed to write to localStorage:', error);
      }
      return newStorage; // Return the updated storage object
    });
  }, [kingDetailedEvaluations, position]); // Depends on detailed results and position

  // --- ADDED: Delete History Item Handler ---
  const handleDeleteHistoryItem = useCallback((fenToDelete: string, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent handleHistoryClick from firing
    console.log('[ChessBoard Callback] handleDeleteHistoryItem FEN:', fenToDelete);
    setHistoryStorage(prevStorage => {
      const newStorage = { ...prevStorage };
      delete newStorage[fenToDelete]; // Remove the key
      console.log('[ChessBoard Callback] Updated historyStorage after delete:', newStorage);
      // The useEffect [historyStorage] will persist this change
      return newStorage;
    });
  }, []); // No dependencies needed as it only uses setHistoryStorage

  // --- History Click Change: Load from the new storage structure --- 
  const handleHistoryClick = useCallback(
    (fen: string) => {
       const evalMap = historyStorage[fen];
       console.log('[ChessBoard Callback] handleHistoryClick:', { fen, evalMap });
       if (!evalMap) {
         console.warn('Evaluation data not found in historyStorage for FEN:', fen);
         // If evalMap is missing, we should probably still show the board
         // but with no evaluations.
       }

       // --- CHANGE: Bypass game.load() --- 
       // Directly set the position state for react-chessboard to render the FEN
       setPosition(fen);
       // Set the active evaluation map (use empty object if evalMap wasn't found)
       setActiveEvaluation(evalMap || {});

       // --- Manually update internal game state --- 
       // This allows interactions like adding/removing pieces after loading history,
       // even if the loaded FEN was initially incomplete.
       const newGame = new Chess();
       newGame.clear();
       const fenParts = fen.split(' ');
       const boardFen = fenParts[0];
       let file = 0;
       let rank = 7;
       try {
           for (const char of boardFen) {
               if (char === '/') {
                   rank--;
                   file = 0;
               } else if (/\d/.test(char)) {
                   file += parseInt(char);
               } else {
                   const square = `${String.fromCharCode(97 + file)}${rank + 1}` as Square;
                   const color = (char === char.toUpperCase()) ? 'w' : 'b';
                   const type = char.toLowerCase() as PieceSymbol;
                   // Use game.put which is generally more permissive than load
                   newGame.put({ type, color }, square);
                   file++;
               }
           }
           // Note: We are intentionally *not* setting turn, castling, etc., 
           // from the old FEN parts here, as the primary goal is to 
           // restore the piece layout for viewing evaluations.
           // The game state might become slightly inconsistent regarding
           // turn/castling if pieces are moved *after* loading history.
           
           setGame(newGame); // Update the internal game state
           console.log("[ChessBoard Callback] Manually updated game state from FEN.");

       } catch (manualLoadError) {
            console.error("Error manually placing pieces from FEN in handleHistoryClick:", manualLoadError, "FEN:", fen);
           // If manual placement fails, fall back to a cleared game state
           const errorGame = new Chess(); errorGame.clear();
           setGame(errorGame);
       }

       // Inform the parent component (App.tsx) that the position has changed
       onPositionChange?.(fen);

    },
    [onPositionChange, historyStorage] // Dependency includes historyStorage now
  );

  // --- Other Callbacks (onSquareClick, etc.) --- 
  // These generally remain the same, ensure handlePositionChange is called correctly
  const onSquareClick = useCallback((square: Square) => {
      console.log('[CB SquareClick]', square, 'Sel:', selectedPiece);
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
      console.log('[CB RightClick]', square);
      try {
          const removeResult = game.remove(square);
          if (removeResult) { handlePositionChange(game.fen()); }
          else { console.warn("Remove empty"); }
      } catch (error) { console.error('Remove error', error); }
  }, [game, handlePositionChange]);

  const onPieceDrop = useCallback((sourceSquare: Square, targetSquare: Square) => {
      console.log('[CB Drop]', sourceSquare, '->', targetSquare);
      try {
          const piece = game.get(sourceSquare); if (!piece) return false;
          game.remove(sourceSquare);
          const existingPiece = game.get(targetSquare); if (existingPiece) { game.remove(targetSquare); }
          game.put(piece, targetSquare);
          handlePositionChange(game.fen()); return true;
      } catch (error) { console.error('Drop error', error); return false; }
  }, [game, handlePositionChange]);

  const clearBoard = useCallback(() => {
      console.log('[CB Clear]');
      const newGame = new Chess(); newGame.clear(); setGame(newGame);
      handlePositionChange(newGame.fen()); setActiveEvaluation({});
  }, [handlePositionChange]); // Added dependency


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