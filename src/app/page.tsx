"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// Game constants
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const BUBBLE_RADIUS = 20;
const GRID_COLS = 15;
const GRID_ROWS = 12;
const COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD'];
const POWER_UP_CHANCE = 0.15;

// Bubble types
type BubbleType = 'normal' | 'bomb' | 'rainbow';
type GameState = 'menu' | 'playing' | 'paused' | 'gameover';

interface Bubble {
  x: number;
  y: number;
  color: string;
  type: BubbleType;
  row: number;
  col: number;
  falling?: boolean;
  fallSpeed?: number;
  vx?: number;
  vy?: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  life: number;
  maxLife: number;
}

export default function BubbleShooterGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>('menu');
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [lives, setLives] = useState(3);
  const [highScore, setHighScore] = useState(0);
  
  // Game objects
  const gameObjects = useRef({
    grid: [] as Bubble[][],
    shooterBubble: null as Bubble | null,
    nextBubble: null as Bubble | null,
    flyingBubble: null as Bubble | null,
    particles: [] as Particle[],
    aimAngle: 0,
    showTrajectory: false,
    mouseX: 0,
    mouseY: 0,
    combo: 0,
    powerUpActive: false
  });

  // Initialize game
  const initGame = useCallback(() => {
    const grid: Bubble[][] = [];
    
    // Create empty grid
    for (let row = 0; row < GRID_ROWS; row++) {
      grid[row] = [];
      for (let col = 0; col < GRID_COLS; col++) {
        grid[row][col] = null as any;
      }
    }
    
    // Fill initial rows with bubbles
    const initialRows = Math.min(6 + Math.floor(level / 3), 10);
    for (let row = 0; row < initialRows; row++) {
      const colCount = row % 2 === 0 ? GRID_COLS : GRID_COLS - 1;
      for (let col = 0; col < colCount; col++) {
        if (Math.random() > 0.1) { // 10% chance of empty space
          const bubble: Bubble = {
            x: getGridX(row, col),
            y: getGridY(row),
            color: COLORS[Math.floor(Math.random() * Math.min(4 + Math.floor(level / 2), COLORS.length))],
            type: Math.random() < POWER_UP_CHANCE ? (Math.random() < 0.5 ? 'bomb' : 'rainbow') : 'normal',
            row,
            col
          };
          grid[row][col] = bubble;
        }
      }
    }
    
    gameObjects.current.grid = grid;
    gameObjects.current.shooterBubble = createRandomBubble();
    gameObjects.current.nextBubble = createRandomBubble();
    gameObjects.current.flyingBubble = null;
    gameObjects.current.particles = [];
    gameObjects.current.combo = 0;
  }, [level]);

  // Helper functions
  const getGridX = (row: number, col: number): number => {
    const offsetX = CANVAS_WIDTH / 2 - (GRID_COLS * BUBBLE_RADIUS);
    return offsetX + col * (BUBBLE_RADIUS * 2) + (row % 2 === 1 ? BUBBLE_RADIUS : 0);
  };

  const getGridY = (row: number): number => {
    return 50 + row * (BUBBLE_RADIUS * 1.5);
  };

  const createRandomBubble = (): Bubble => {
    const availableColors = getAvailableColors();
    const color = availableColors.length > 0 ? 
      availableColors[Math.floor(Math.random() * availableColors.length)] :
      COLORS[Math.floor(Math.random() * COLORS.length)];
    
    return {
      x: CANVAS_WIDTH / 2,
      y: CANVAS_HEIGHT - 50,
      color,
      type: Math.random() < POWER_UP_CHANCE ? (Math.random() < 0.5 ? 'bomb' : 'rainbow') : 'normal',
      row: -1,
      col: -1
    };
  };

  const getAvailableColors = (): string[] => {
    const colors = new Set<string>();
    gameObjects.current.grid.forEach(row => {
      row.forEach(bubble => {
        if (bubble && bubble.type === 'normal') {
          colors.add(bubble.color);
        }
      });
    });
    return Array.from(colors);
  };

  // Collision detection
  const getBubbleDistance = (b1: Bubble, b2: Bubble): number => {
    return Math.sqrt(Math.pow(b1.x - b2.x, 2) + Math.pow(b1.y - b2.y, 2));
  };

  const findGridPosition = (x: number, y: number): {row: number, col: number} => {
    for (let row = 0; row < GRID_ROWS; row++) {
      const colCount = row % 2 === 0 ? GRID_COLS : GRID_COLS - 1;
      for (let col = 0; col < colCount; col++) {
        const gridX = getGridX(row, col);
        const gridY = getGridY(row);
        const distance = Math.sqrt(Math.pow(x - gridX, 2) + Math.pow(y - gridY, 2));
        if (distance < BUBBLE_RADIUS * 2.2) {
          return {row, col};
        }
      }
    }
    return {row: -1, col: -1};
  };

  // Matching algorithm
  const findConnectedBubbles = (startRow: number, startCol: number, color: string, type: BubbleType): Bubble[] => {
    const visited = new Set<string>();
    const connected: Bubble[] = [];
    const queue: {row: number, col: number}[] = [{row: startRow, col: startCol}];
    
    while (queue.length > 0) {
      const {row, col} = queue.shift()!;
      const key = `${row}-${col}`;
      
      if (visited.has(key) || row < 0 || row >= GRID_ROWS) continue;
      
      const bubble = gameObjects.current.grid[row] && gameObjects.current.grid[row][col];
      if (!bubble) continue;
      
      // Rainbow bubbles match everything, others match by color
      if (type === 'rainbow' || bubble.type === 'rainbow' || bubble.color === color) {
        visited.add(key);
        connected.push(bubble);
        
        // Check neighbors (hexagonal grid)
        const neighbors = getNeighbors(row, col);
        neighbors.forEach(neighbor => queue.push(neighbor));
      }
    }
    
    return connected;
  };

  const getNeighbors = (row: number, col: number): {row: number, col: number}[] => {
    const neighbors = [];
    const isEvenRow = row % 2 === 0;
    
    // Standard neighbors
    neighbors.push(
      {row: row - 1, col: col},
      {row: row + 1, col: col},
      {row, col: col - 1},
      {row, col: col + 1}
    );
    
    // Diagonal neighbors depend on row parity
    if (isEvenRow) {
      neighbors.push(
        {row: row - 1, col: col - 1},
        {row: row + 1, col: col - 1}
      );
    } else {
      neighbors.push(
        {row: row - 1, col: col + 1},
        {row: row + 1, col: col + 1}
      );
    }
    
    return neighbors;
  };

  const removeBubbles = (bubblesToRemove: Bubble[]): void => {
    bubblesToRemove.forEach(bubble => {
      // Create particles
      for (let i = 0; i < 8; i++) {
        const particle: Particle = {
          x: bubble.x,
          y: bubble.y,
          vx: (Math.random() - 0.5) * 10,
          vy: (Math.random() - 0.5) * 10 - 2,
          color: bubble.color,
          life: 30,
          maxLife: 30
        };
        gameObjects.current.particles.push(particle);
      }
      
      // Remove from grid
      if (bubble.row >= 0 && bubble.row < GRID_ROWS && gameObjects.current.grid[bubble.row]) {
        gameObjects.current.grid[bubble.row][bubble.col] = null as any;
      }
    });
    
    // Calculate score
    const baseScore = bubblesToRemove.length * 10;
    const comboMultiplier = Math.max(1, gameObjects.current.combo);
    const finalScore = baseScore * comboMultiplier;
    setScore(prev => prev + finalScore);
    
    gameObjects.current.combo++;
    
    // Check for power-ups
    bubblesToRemove.forEach(bubble => {
      if (bubble.type === 'bomb') {
        explodeBomb(bubble);
      }
    });
  };

  const explodeBomb = (bombBubble: Bubble): void => {
    const explosionRadius = BUBBLE_RADIUS * 3;
    const bubblesInRange: Bubble[] = [];
    
    gameObjects.current.grid.forEach(row => {
      row.forEach(bubble => {
        if (bubble && getBubbleDistance(bombBubble, bubble) <= explosionRadius) {
          bubblesInRange.push(bubble);
        }
      });
    });
    
    if (bubblesInRange.length > 0) {
      removeBubbles(bubblesInRange);
      setScore(prev => prev + 50); // Bomb bonus
    }
  };

  const checkForFallingBubbles = (): void => {
    // Mark all bubbles as potentially falling
    const connected = new Set<string>();
    
    // Find all bubbles connected to the top
    for (let col = 0; col < GRID_COLS; col++) {
      if (gameObjects.current.grid[0] && gameObjects.current.grid[0][col]) {
        markConnectedBubbles(0, col, connected);
      }
    }
    
    // Mark disconnected bubbles for falling
    gameObjects.current.grid.forEach((row, rowIndex) => {
      row.forEach((bubble, colIndex) => {
        if (bubble && !connected.has(`${rowIndex}-${colIndex}`)) {
          bubble.falling = true;
          bubble.fallSpeed = 0;
        }
      });
    });
  };

  const markConnectedBubbles = (row: number, col: number, connected: Set<string>): void => {
    const key = `${row}-${col}`;
    if (connected.has(key) || row < 0 || row >= GRID_ROWS) return;
    
    const bubble = gameObjects.current.grid[row] && gameObjects.current.grid[row][col];
    if (!bubble) return;
    
    connected.add(key);
    const neighbors = getNeighbors(row, col);
    neighbors.forEach(neighbor => markConnectedBubbles(neighbor.row, neighbor.col, connected));
  };

  // Game loop
  const updateGame = useCallback(() => {
    if (gameState !== 'playing') return;
    
    // Update flying bubble
    if (gameObjects.current.flyingBubble) {
      const bubble = gameObjects.current.flyingBubble;
      bubble.x += bubble.vx!;
      bubble.y += bubble.vy!;
      
      // Wall collision
      if (bubble.x - BUBBLE_RADIUS <= 0 || bubble.x + BUBBLE_RADIUS >= CANVAS_WIDTH) {
        bubble.vx! *= -1;
        bubble.x = bubble.x - BUBBLE_RADIUS <= 0 ? BUBBLE_RADIUS : CANVAS_WIDTH - BUBBLE_RADIUS;
      }
      
      // Top collision
      if (bubble.y - BUBBLE_RADIUS <= 0) {
        attachBubbleToGrid(bubble);
      }
      
      // Bubble collision
      let collisionFound = false;
      gameObjects.current.grid.forEach(row => {
        row.forEach(gridBubble => {
          if (gridBubble && !collisionFound && getBubbleDistance(bubble, gridBubble) < BUBBLE_RADIUS * 2) {
            attachBubbleToGrid(bubble);
            collisionFound = true;
          }
        });
      });
    }
    
    // Update falling bubbles
    const fallingBubbles = [];
    gameObjects.current.grid.forEach((row, rowIndex) => {
      row.forEach((bubble, colIndex) => {
        if (bubble && bubble.falling) {
          bubble.fallSpeed = (bubble.fallSpeed || 0) + 0.5;
          bubble.y += bubble.fallSpeed;
          
          if (bubble.y > CANVAS_HEIGHT + 50) {
            gameObjects.current.grid[rowIndex][colIndex] = null as any;
            setScore(prev => prev + 5); // Falling bonus
          } else {
            fallingBubbles.push(bubble);
          }
        }
      });
    });
    
    // Update particles
    gameObjects.current.particles = gameObjects.current.particles.filter(particle => {
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.vy += 0.2; // Gravity
      particle.life--;
      return particle.life > 0;
    });
    
    // Check win condition
    checkWinCondition();
    
    // Check lose condition
    checkLoseCondition();
  }, [gameState]);

  const attachBubbleToGrid = (bubble: Bubble): void => {
    const {row, col} = findGridPosition(bubble.x, bubble.y);
    
    if (row >= 0 && col >= 0 && row < GRID_ROWS) {
      // Place bubble in grid
      bubble.row = row;
      bubble.col = col;
      bubble.x = getGridX(row, col);
      bubble.y = getGridY(row);
      gameObjects.current.grid[row][col] = bubble;
      
      // Check for matches
      const connectedBubbles = findConnectedBubbles(row, col, bubble.color, bubble.type);
      if (connectedBubbles.length >= 3 || bubble.type === 'bomb') {
        removeBubbles(connectedBubbles);
        checkForFallingBubbles();
      } else {
        gameObjects.current.combo = 0; // Reset combo
      }
      
      // Prepare next shot
      gameObjects.current.flyingBubble = null;
      gameObjects.current.shooterBubble = gameObjects.current.nextBubble;
      gameObjects.current.nextBubble = createRandomBubble();
    }
  };

  const checkWinCondition = (): void => {
    let hasBubbles = false;
    gameObjects.current.grid.forEach(row => {
      row.forEach(bubble => {
        if (bubble && !bubble.falling) {
          hasBubbles = true;
        }
      });
    });
    
    if (!hasBubbles) {
      // Level complete
      const levelBonus = level * 100;
      setScore(prev => prev + levelBonus);
      setLevel(prev => prev + 1);
      setTimeout(() => initGame(), 1000);
    }
  };

  const checkLoseCondition = (): void => {
    // Check if bubbles reached bottom
    const bottomRow = GRID_ROWS - 3;
    let reachedBottom = false;
    
    for (let row = bottomRow; row < GRID_ROWS; row++) {
      if (gameObjects.current.grid[row]) {
        gameObjects.current.grid[row].forEach(bubble => {
          if (bubble && !bubble.falling) {
            reachedBottom = true;
          }
        });
      }
    }
    
    if (reachedBottom) {
      setLives(prev => {
        const newLives = prev - 1;
        if (newLives <= 0) {
          setGameState('gameover');
          if (score > highScore) {
            setHighScore(score);
            localStorage.setItem('bubbleShooterHighScore', score.toString());
          }
        }
        return newLives;
      });
      
      if (lives > 1) {
        setTimeout(() => initGame(), 1000);
      }
    }
  };

  // Input handling
  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>): void => {
    if (gameState === 'menu') {
      startGame();
      return;
    }
    
    if (gameState === 'gameover') {
      restartGame();
      return;
    }
    
    if (gameState !== 'playing' || gameObjects.current.flyingBubble) return;
    
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    shootBubble(x, y);
  };

  const handleCanvasMouseMove = (event: React.MouseEvent<HTMLCanvasElement>): void => {
    if (gameState !== 'playing') return;
    
    const rect = canvasRef.current!.getBoundingClientRect();
    gameObjects.current.mouseX = event.clientX - rect.left;
    gameObjects.current.mouseY = event.clientY - rect.top;
    
    const dx = gameObjects.current.mouseX - CANVAS_WIDTH / 2;
    const dy = gameObjects.current.mouseY - (CANVAS_HEIGHT - 50);
    gameObjects.current.aimAngle = Math.atan2(dy, dx);
    gameObjects.current.showTrajectory = dy < 0; // Only show when aiming upward
  };

  const shootBubble = (targetX: number, targetY: number): void => {
    if (!gameObjects.current.shooterBubble || gameObjects.current.flyingBubble) return;
    
    const bubble = { ...gameObjects.current.shooterBubble };
    const dx = targetX - bubble.x;
    const dy = targetY - bubble.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const speed = 8;
    
    bubble.vx = (dx / distance) * speed;
    bubble.vy = (dy / distance) * speed;
    
    gameObjects.current.flyingBubble = bubble;
    gameObjects.current.shooterBubble = null;
  };

  // Game state management
  const startGame = (): void => {
    setGameState('playing');
    setScore(0);
    setLevel(1);
    setLives(3);
    initGame();
  };

  const restartGame = (): void => {
    startGame();
  };

  const pauseGame = (): void => {
    setGameState(prev => prev === 'playing' ? 'paused' : 'playing');
  };

  // Touch handling for mobile
  const handleTouchStart = (event: React.TouchEvent<HTMLCanvasElement>): void => {
    event.preventDefault();
    const touch = event.touches[0];
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    
    if (gameState === 'playing' && !gameObjects.current.flyingBubble) {
      shootBubble(x, y);
    } else if (gameState === 'menu') {
      startGame();
    } else if (gameState === 'gameover') {
      restartGame();
    }
  };

  // Rendering
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d')!;
    
    // Clear canvas
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    if (gameState === 'menu') {
      renderMenu(ctx);
    } else if (gameState === 'gameover') {
      renderGameOver(ctx);
    } else {
      renderGame(ctx);
    }
  }, [gameState, score, level, lives]);

  const renderMenu = (ctx: CanvasRenderingContext2D): void => {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    ctx.fillStyle = '#333';
    ctx.font = 'bold 48px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('🎯 Happy Bubble Shooter', CANVAS_WIDTH / 2, 200);
    
    ctx.font = '24px Arial';
    ctx.fillText('Match 3 or more bubbles to pop them!', CANVAS_WIDTH / 2, 250);
    ctx.fillText('Use power-ups strategically for high scores!', CANVAS_WIDTH / 2, 280);
    
    ctx.font = '20px Arial';
    ctx.fillText(`High Score: ${highScore}`, CANVAS_WIDTH / 2, 350);
    
    ctx.fillStyle = '#4ECDC4';
    ctx.fillRect(CANVAS_WIDTH / 2 - 100, 400, 200, 50);
    ctx.fillStyle = 'white';
    ctx.font = 'bold 24px Arial';
    ctx.fillText('Click to Start', CANVAS_WIDTH / 2, 430);
  };

  const renderGameOver = (ctx: CanvasRenderingContext2D): void => {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    ctx.fillStyle = 'white';
    ctx.font = 'bold 48px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Game Over!', CANVAS_WIDTH / 2, 200);
    
    ctx.font = '24px Arial';
    ctx.fillText(`Final Score: ${score}`, CANVAS_WIDTH / 2, 250);
    ctx.fillText(`Level Reached: ${level}`, CANVAS_WIDTH / 2, 280);
    
    if (score > highScore) {
      ctx.fillStyle = '#FFD700';
      ctx.fillText('🎉 NEW HIGH SCORE! 🎉', CANVAS_WIDTH / 2, 320);
    } else {
      ctx.fillStyle = 'white';
      ctx.fillText(`High Score: ${highScore}`, CANVAS_WIDTH / 2, 320);
    }
    
    ctx.fillStyle = '#4ECDC4';
    ctx.fillRect(CANVAS_WIDTH / 2 - 100, 400, 200, 50);
    ctx.fillStyle = 'white';
    ctx.font = 'bold 24px Arial';
    ctx.fillText('Play Again', CANVAS_WIDTH / 2, 430);
  };

  const renderGame = (ctx: CanvasRenderingContext2D): void => {
    // Background gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    gradient.addColorStop(0, '#87CEEB');
    gradient.addColorStop(1, '#E0F6FF');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // Render grid bubbles
    gameObjects.current.grid.forEach(row => {
      row.forEach(bubble => {
        if (bubble) {
          renderBubble(ctx, bubble);
        }
      });
    });
    
    // Render flying bubble
    if (gameObjects.current.flyingBubble) {
      renderBubble(ctx, gameObjects.current.flyingBubble);
    }
    
    // Render trajectory line
    if (gameObjects.current.showTrajectory && gameObjects.current.shooterBubble && !gameObjects.current.flyingBubble) {
      renderTrajectory(ctx);
    }
    
    // Render shooter bubble
    if (gameObjects.current.shooterBubble) {
      renderBubble(ctx, gameObjects.current.shooterBubble);
    }
    
    // Render particles
    gameObjects.current.particles.forEach(particle => {
      const alpha = particle.life / particle.maxLife;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
    
    // Render UI
    renderUI(ctx);
  };

  const renderBubble = (ctx: CanvasRenderingContext2D, bubble: Bubble): void => {
    ctx.save();
    
    // Bubble shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.beginPath();
    ctx.arc(bubble.x + 2, bubble.y + 2, BUBBLE_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    
    // Bubble body
    const gradient = ctx.createRadialGradient(
      bubble.x - 5, bubble.y - 5, 0,
      bubble.x, bubble.y, BUBBLE_RADIUS
    );
    gradient.addColorStop(0, bubble.color);
    gradient.addColorStop(1, adjustBrightness(bubble.color, -20));
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(bubble.x, bubble.y, BUBBLE_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    
    // Bubble highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.beginPath();
    ctx.arc(bubble.x - 5, bubble.y - 5, BUBBLE_RADIUS * 0.3, 0, Math.PI * 2);
    ctx.fill();
    
    // Power-up indicators
    if (bubble.type === 'bomb') {
      ctx.fillStyle = '#FF4444';
      ctx.font = 'bold 16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('💥', bubble.x, bubble.y + 5);
    } else if (bubble.type === 'rainbow') {
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('🌈', bubble.x, bubble.y + 5);
    }
    
    ctx.restore();
  };

  const adjustBrightness = (color: string, amount: number): string => {
    const hex = color.replace('#', '');
    const r = Math.max(0, Math.min(255, parseInt(hex.substr(0, 2), 16) + amount));
    const g = Math.max(0, Math.min(255, parseInt(hex.substr(2, 2), 16) + amount));
    const b = Math.max(0, Math.min(255, parseInt(hex.substr(4, 2), 16) + amount));
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  };

  const renderTrajectory = (ctx: CanvasRenderingContext2D): void => {
    if (!gameObjects.current.shooterBubble) return;
    
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(gameObjects.current.shooterBubble.x, gameObjects.current.shooterBubble.y);
    
    const length = 150;
    const endX = gameObjects.current.shooterBubble.x + Math.cos(gameObjects.current.aimAngle) * length;
    const endY = gameObjects.current.shooterBubble.y + Math.sin(gameObjects.current.aimAngle) * length;
    
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.setLineDash([]);
  };

  const renderUI = (ctx: CanvasRenderingContext2D): void => {
    // Score
    ctx.fillStyle = 'white';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`Score: ${score}`, 20, 30);
    
    // Level
    ctx.fillText(`Level: ${level}`, 20, 60);
    
    // Lives
    ctx.fillText(`Lives: ${lives}`, 20, 90);
    
    // Combo
    if (gameObjects.current.combo > 1) {
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 20px Arial';
      ctx.fillText(`Combo: ${gameObjects.current.combo}x`, 20, 120);
    }
    
    // Next bubble preview
    if (gameObjects.current.nextBubble) {
      ctx.fillStyle = 'white';
      ctx.font = 'bold 16px Arial';
      ctx.textAlign = 'right';
      ctx.fillText('Next:', CANVAS_WIDTH - 80, 30);
      
      const nextBubble = { ...gameObjects.current.nextBubble };
      nextBubble.x = CANVAS_WIDTH - 40;
      nextBubble.y = 50;
      renderBubble(ctx, nextBubble);
    }
    
    // Pause button
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.fillRect(CANVAS_WIDTH - 80, CANVAS_HEIGHT - 60, 60, 40);
    ctx.fillStyle = '#333';
    ctx.font = '16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(gameState === 'paused' ? 'Resume' : 'Pause', CANVAS_WIDTH - 50, CANVAS_HEIGHT - 35);
  };

  // Game loop effect
  useEffect(() => {
    let animationId: number;
    
    const gameLoop = () => {
      updateGame();
      render();
      animationId = requestAnimationFrame(gameLoop);
    };
    
    gameLoop();
    
    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [updateGame, render]);

  // Load high score
  useEffect(() => {
    const savedHighScore = localStorage.getItem('bubbleShooterHighScore');
    if (savedHighScore) {
      setHighScore(parseInt(savedHighScore, 10));
    }
  }, []);

  // Initialize game
  useEffect(() => {
    if (gameState === 'playing') {
      initGame();
    }
  }, [gameState, initGame]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <div className="bg-white rounded-lg shadow-2xl p-6 max-w-4xl w-full">
        <h1 className="text-4xl font-bold text-center mb-6 text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-600">
          🎯 Happy Bubble Shooter
        </h1>
        
        <div className="flex justify-center">
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            onClick={handleCanvasClick}
            onMouseMove={handleCanvasMouseMove}
            onTouchStart={handleTouchStart}
            className="border-4 border-gradient-to-r from-purple-400 to-pink-400 rounded-lg cursor-crosshair touch-none"
            style={{
              background: 'linear-gradient(to bottom, #87CEEB, #E0F6FF)',
              maxWidth: '100%',
              height: 'auto'
            }}
          />
        </div>
        
        <div className="mt-6 text-center text-gray-600">
          <p className="text-sm">
            🎮 <strong>Desktop:</strong> Move mouse to aim, click to shoot
          </p>
          <p className="text-sm">
            📱 <strong>Mobile:</strong> Touch where you want to shoot
          </p>
          <p className="text-sm mt-2">
            💥 <strong>Bomb bubbles</strong> explode nearby bubbles | 🌈 <strong>Rainbow bubbles</strong> match any color
          </p>
        </div>
      </div>
    </div>
  );
}