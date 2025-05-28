// controllers/statsController.js
const pool = require('../db');

exports.getCurrentStats = async (req, res) => {
  console.log('here start')
  try {
    const [results] = await pool.query('CALL get_current_attestation_stats()');
    
    console.log(results)

    // Исправляем обработку результатов
    res.json({
      total_failed: results[0][0].total_failed, // пропуски (NULL)
      students_with_3plus_zeros: results[1].map(student => ({
        ...student,
        zero_count: student.fail_count // переименовываем fail_count в zero_count
      })),
      failed_by_group_subject: results[2].map(item => ({
        ...item,
        failed_count: item.zero_count // переименовываем zero_count в failed_count
      }))
    });
    
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка при получении статистики' });
  }
};