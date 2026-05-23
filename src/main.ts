const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d');

if (!ctx) {
  console.error('Failed to get 2D context');
} else {
  // Draw a single red pixel in the center
  ctx.fillStyle = '#FF0000';
  ctx.fillRect(160, 100, 1, 1);
  
  console.log('LaLa project initialized - Phase 0 complete');
}