declare module 'stockfish.js' {
  function Stockfish(): {
    onmessage: (event: { data: string }) => void;
    postMessage: (message: string) => void;
  };
  export = Stockfish;
} 