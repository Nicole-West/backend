const db = require('../db');

exports.getDashboard = async (req, res) => {
  try {
    console.log('[GET] /api/dashboard');

    const [results] = await db.query('CALL get_dashboard_data()');

    const [year, month, semester, groups] = results;

    res.json({
      year: year[0],
      month: month[0],
      semester: semester[0],
      groupsByCourse: groups.reduce((acc, row) => {
        if (!acc[row.course_name]) {
          acc[row.course_name] = [];
        }
        acc[row.course_name].push({
            group_id: row.group_id,  // ID группы
            group_number: row.group_number  // Номер группы
          });
        return acc;
      }, {})
    });
  } catch (e) {
    console.error('Ошибка в getDashboard:', e);
    res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
};
