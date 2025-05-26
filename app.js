const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const authRoutes = require('./routes/authRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const group = require('./routes/groupRoutes');
const adminRoutes = require('./routes/adminRoutes');
const nextMonthRoutes = require('./routes/nextMonthRoutes');
const academicYearRoutes = require('./routes/academicYear');
const archiveRoutes = require('./routes/archiveRoutes');
const nextSemesterRoutes = require('./routes/nextSemesterRoutes');

const app = express();

app.use(cors());
app.use(bodyParser.json());

// Роуты
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/group', group);
app.use('/api/admin', adminRoutes);
app.use('/api/month', nextMonthRoutes);
app.use('/api/academic-year', academicYearRoutes);
app.use('/api/archive', archiveRoutes);
app.use('/api/semester-transition', nextSemesterRoutes);

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`);
});

// app.js