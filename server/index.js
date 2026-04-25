import app from './routes/recommendations.js';

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 SeerrV2 Engine API listening on http://localhost:${PORT}`);
});
