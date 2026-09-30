import express from 'express';
import leadRoutes from './routes/leadRoutes';
import authRoutes from './routes/authRoutes';
import adminRoutes from './routes/adminRoutes';
import orgRoutes from './routes/orgRoutes';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());

// Mount các API routes
app.use('/api/leads', leadRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/org', orgRoutes);

app.get('/health', (req, res) => {
  res.send('Landing Backend is running OK on port 4000!');
});

app.listen(PORT, () => {
  console.log(`🚀 Landing Backend server is running on http://localhost:${PORT}`);
});
