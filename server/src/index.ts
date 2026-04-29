import express from "express";
import cors from "cors";
import vehiclesRouter from "./routes/vehicles";
import speechRouter from "./routes/speech";
import imageRouter from "./routes/image";

const app = express();
const port = process.env.PORT || 9091;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Health check
app.get('/api/v1/health', (req, res) => {
  console.log('Health check success');
  res.status(200).json({ status: 'ok' });
});

// API Routes
app.use('/api/v1/vehicles', vehiclesRouter);
app.use('/api/v1/speech', speechRouter);
app.use('/api/v1/image', imageRouter);

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}/`);
});
