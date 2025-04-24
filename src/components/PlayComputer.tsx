import { useState, useEffect, useRef, useCallback } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess, Square } from 'chess.js';

export function PlayComputer() {
  const [game, setGame] = useState(new Chess());
  const [isEngineThinking, setIsEngineThinking] = useState(false);
  const [engineReady, setEngineReady] = useState(false);
  const [engineVersion, setEngineVersion] = useState<string>('');
  const engineRef = useRef<Worker | null>(null);

  useEffect(() => {
    const initStockfish = () => {
      if (typeof window.STOCKFISH === 'function') {
        console.log('Initializing Stockfish engine...');
        const stockfish = window.STOCKFISH();
        
        stockfish.onmessage = (event: MessageEvent) => {
          const message = event.data;
          console.log('Engine:', message);
          
          if (message.includes('Stockfish')) {
            // Extract version from the identification message
            setEngineVersion(message);
            console.log('Engine version:', message);
          }
          
          if (message === 'readyok' || message.includes('Stockfish')) {
            console.log('Stockfish engine is ready');
            setEngineReady(true);
          }
          
          if (message.startsWith('bestmove')) {
            const moveMatch = message.match(/bestmove\s+(\w+)/);
            if (moveMatch) {
              const bestMove = moveMatch[1];
              const from = bestMove.slice(0, 2) as Square;
              const to = bestMove.slice(2, 4) as Square;
              const promotion = bestMove.length > 4 ? bestMove[4] : undefined;
              
              // Make the engine's move
              const newGame = new Chess(game.fen());
              newGame.move({ from, to, promotion });
              setGame(newGame);
              setIsEngineThinking(false);
            }
          }
        };

        stockfish.onerror = (error) => {
          console.error('Stockfish worker error:', error);
        };

        engineRef.current = stockfish;
        stockfish.postMessage('uci');
        stockfish.postMessage('setoption name MultiPV value 1');
        stockfish.postMessage('isready');
      } else {
        console.log('Stockfish not available yet, retrying...');
        setTimeout(initStockfish, 100);
      }
    };

    initStockfish();

    return () => {
      if (engineRef.current) {
        engineRef.current.postMessage('quit');
        engineRef.current.terminate();
      }
    };
  }, []);

  const makeEngineMove = useCallback(() => {
    if (!engineRef.current || !engineReady || game.isGameOver()) return;
    
    setIsEngineThinking(true);
    engineRef.current.postMessage('position fen ' + game.fen());
    engineRef.current.postMessage('go movetime 20000'); // 20 seconds per move
  }, [game, engineReady]);

  const onDrop = (sourceSquare: Square, targetSquare: Square): boolean => {
    try {
      // Make the player's move
      const move = game.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: 'q' // Always promote to queen for simplicity
      });

      if (move === null) return false;

      // Create a new game with the updated position
      const newGame = new Chess(game.fen());
      setGame(newGame);

      // Make engine move in response
      makeEngineMove();
      
      return true;
    } catch (error) {
      return false;
    }
  };

  return (
    <div style={{ 
      padding: '20px',
      maxWidth: '800px',
      margin: '0 auto',
      textAlign: 'center'
    }}>
      <h1>Play Against Computer</h1>
      {engineVersion && (
        <div style={{ 
          fontSize: '14px', 
          color: '#666', 
          marginBottom: '10px' 
        }}>
          {engineVersion}
        </div>
      )}
      <div style={{ marginBottom: '20px' }}>
        {!engineReady ? (
          <div>Initializing engine...</div>
        ) : isEngineThinking ? (
          <div>Computer is thinking...</div>
        ) : game.isGameOver() ? (
          <div>
            Game Over! 
            {game.isCheckmate() ? 
              (game.turn() === 'w' ? ' Black wins!' : ' White wins!') : 
              game.isDraw() ? ' Draw!' : 
              ' Game over!'}
          </div>
        ) : (
          <div>
            {game.turn() === 'w' ? "Your turn (White)" : "Computer is playing..."}
          </div>
        )}
      </div>
      
      <div style={{ width: '500px', margin: '0 auto' }}>
        <Chessboard
          position={game.fen()}
          onPieceDrop={onDrop}
          boardWidth={500}
          areArrowsAllowed={false}
        />
      </div>

      <div style={{ marginTop: '20px' }}>
        <button
          onClick={() => {
            setGame(new Chess());
          }}
          style={{ 
            padding: '10px 20px',
            fontSize: '16px'
          }}
        >
          New Game
        </button>
      </div>
    </div>
  );
} 