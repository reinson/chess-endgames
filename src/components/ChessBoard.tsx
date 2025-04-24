import { useState, useCallback } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess, PieceSymbol, Square } from 'chess.js';
import './ChessBoard.css';

interface ChessBoardProps {
  onPositionChange?: (fen: string) => void;
  kingEvaluationResults: Record<string, string>;
  isEvaluatingKings: boolean;
  onEvaluateKingPositions: () => void;
}

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
  kingEvaluationResults,
  isEvaluatingKings,
  onEvaluateKingPositions
}: ChessBoardProps) {
  const [game, setGame] = useState(new Chess());
  const [position, setPosition] = useState(game.fen());
  const [selectedPiece, setSelectedPiece] = useState<string | null>(null);

  const BOARD_WIDTH = 500;
  const SQUARE_SIZE = BOARD_WIDTH / 8;

  const handlePositionChange = useCallback((fen: string) => {
    setPosition(fen);
    if (onPositionChange) {
        onPositionChange(fen);
    }
  }, [onPositionChange]);

  const onSquareClick = useCallback((square: Square) => {
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
        console.warn(`Square ${square} is already occupied. Cannot place ${selectedPiece}.`);
        setSelectedPiece(null);
        return;
    }
    try {
      const pieceType = selectedPiece;
      game.put({ type: pieceType.toLowerCase() as PieceSymbol, color: pieceType === pieceType.toUpperCase() ? 'w' : 'b' }, square);
      handlePositionChange(game.fen());
    } catch (error) {
      console.error('Error placing piece:', error);
      setSelectedPiece(null);
    }
  }, [game, selectedPiece, handlePositionChange]);

  const onSquareRightClick = useCallback((square: Square) => {
    try {
      game.remove(square);
      handlePositionChange(game.fen());
    } catch (error) {
      console.error('Error removing piece:', error);
    }
  }, [game, handlePositionChange]);

  const onPieceDrop = useCallback((sourceSquare: Square, targetSquare: Square) => {
    try {
      const piece = game.get(sourceSquare);
      if (!piece) return false;
      game.remove(sourceSquare);
      game.put(piece, targetSquare);
      handlePositionChange(game.fen());
      return true;
    } catch (error) {
      console.error('Error moving piece:', error);
      return false;
    }
  }, [game, handlePositionChange]);

  const clearBoard = () => {
    const newGame = new Chess();
    newGame.clear();
    setGame(newGame);
    handlePositionChange(newGame.fen());
  };

  const resetBoard = () => {
    const newGame = new Chess();
    setGame(newGame);
    handlePositionChange(newGame.fen());
  };

  return (
    <div className="chess-board-container">
      <div className="board-and-controls">
        <div style={{ position: 'relative', width: BOARD_WIDTH, height: BOARD_WIDTH }}>
          <Chessboard
            position={position}
            onSquareClick={onSquareClick}
            onSquareRightClick={onSquareRightClick}
            onPieceDrop={onPieceDrop}
            boardWidth={BOARD_WIDTH}
          />
          <div
            className="evaluation-overlays"
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
            }}
          >
            {Object.entries(kingEvaluationResults)
                .filter(([/* square */, emoji]) => emoji !== '')
                .map(([square, emoji]) => {
                const fileIndex = square.charCodeAt(0) - 'a'.charCodeAt(0);
                const rankIndex = 8 - parseInt(square[1]);
                const top = rankIndex * SQUARE_SIZE;
                const left = fileIndex * SQUARE_SIZE;

                return (
                   <div
                      key={square}
                      className="evaluation-emoji"
                      style={{
                         position: 'absolute',
                         top: `${top}px`,
                         left: `${left}px`,
                         width: `${SQUARE_SIZE}px`,
                         height: `${SQUARE_SIZE}px`,
                         display: 'flex',
                         alignItems: 'center',
                         justifyContent: 'center',
                         fontSize: '24px',
                         fontWeight: '500',
                         color: 'rgba(0, 0, 0, 0.75)',
                         zIndex: 2,
                      }}
                   >
                      {emoji}
                   </div>
                );
            })}
          </div>
        </div>
        <div className="piece-buttons">
          {PIECES.map(({ symbol, type }) => (
            <div
              key={`button-${type}`}
              className={`piece-button ${selectedPiece === type ? 'selected' : ''}`}
              onClick={() => setSelectedPiece(type)}
            >
              {symbol}
            </div>
          ))}
        </div>
      </div>
      <div className="controls">
        <div style={{ width: '100%', marginBottom: '10px' }}>
          <button onClick={resetBoard} style={{ marginRight: '10px' }}>Reset Board</button>
          <button onClick={clearBoard} style={{ marginRight: '10px' }}>Clear Board</button>
          <button onClick={onEvaluateKingPositions} disabled={isEvaluatingKings}>
            {isEvaluatingKings ? 'Evaluating Kings...' : 'Evaluate King Positions'}
          </button>
        </div>
      </div>
    </div>
  );
} 