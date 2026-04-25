     1|import app from './routes/recommendations.js';
     2|
     3|const PORT = process.env.PORT || 3000;
     4|
     5|app.listen(PORT, () => {
     6|  console.log(`🚀 Mediocre Engine API listening on http://localhost:${PORT}`);
     7|});
     8|