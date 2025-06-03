const { response } = require('express');
const db = require('../db');

exports.getCurrentYearInfo = async (req, res) => {
    try {
        // Получаем текущий учебный год
        const [currentYear] = await db.query(
            'SELECT year_id, year FROM academic_years WHERE is_current = TRUE LIMIT 1'
        );

        if (currentYear.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Текущий учебный год не найден в системе'
            });
        }

        // Генерируем следующий год (2023-2024 -> 2024-2025)
        const current = currentYear[0].year;
        const [start, end] = current.split('-').map(Number);
        const nextYear = `${start + 1}-${end + 1}`;

        res.json({
            success: true,
            data: {
                currentYear: current,
                currentYearId: currentYear[0].year_id,
                nextYear
            }
        });
    } catch (err) {
        console.error('Ошибка при получении учебного года:', err);
        res.status(500).json({
            success: false,
            message: 'Внутренняя ошибка сервера при получении данных'
        });
    }
};

// Получение выпускников
exports.getGraduatingStudents = async (req, res) => {
    try {
        const { yearId } = req.params;

        // Получаем группы выпускников (4 курс бакалавриата и 2 курс магистратуры)
        const [groups] = await db.query(`
            SELECT 
                sg.group_id,
                sg.group_number,
                c.course_name
            FROM group_history gh
            JOIN student_groups sg ON gh.group_id = sg.group_id
            JOIN courses c ON gh.course_id = c.course_id
            WHERE gh.year_id = ?
            AND c.course_name IN ('Бакалавриат 4 курс', 'Магистратура 2 курс')
            AND sg.status = 'active'
        `, [yearId]);

        // Для каждой группы получаем студентов
        const result = await Promise.all(groups.map(async group => {
            const [students] = await db.query(`
                SELECT 
                    s.student_id,
                    s.full_name
                FROM student_history sh
                JOIN students s ON sh.student_id = s.student_id
                WHERE sh.group_id = ?
                AND sh.year_id = ?
                AND sh.status = 'active'
                AND s.status = 'studying'
            `, [group.group_id, yearId]);

            return {
                ...group,
                students
            };
        }));

        res.json({
            success: true,
            data: result
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: 'Ошибка при получении выпускников'
        });
    }
};

// Обработка перехода
exports.processTransition = async (req, res) => {
    console.log('Here');
    try {
        const { currentYearId, nextYear, repeatStudents = null } = req.body;

        // 1. Обновляем статусы выпускников
        await db.query(`
            UPDATE students s
            JOIN student_history sh ON s.student_id = sh.student_id
            JOIN group_history gh ON sh.group_id = gh.group_id
            JOIN courses c ON gh.course_id = c.course_id
            SET s.status = CASE
                WHEN ? IS NOT NULL AND s.student_id IN (?) THEN 'repeat_graduate'
                ELSE 'graduated'
            END
            WHERE gh.year_id = ?
            AND c.course_name IN ('Бакалавриат 4 курс', 'Магистратура 2 курс')
        `, [repeatStudents, repeatStudents, currentYearId]);
        console.log('done 1');

        // 2. Архивируем записи выпускников
        await db.query(`
            UPDATE student_history sh
            JOIN group_history gh ON sh.group_id = gh.group_id
            JOIN courses c ON gh.course_id = c.course_id
            SET sh.status = 'archived'
            WHERE gh.year_id = ?
            AND c.course_name IN ('Бакалавриат 4 курс', 'Магистратура 2 курс')
        `, [currentYearId]);
        console.log('done 2');

        // 3. Архивируем группы выпускников
        await db.query(`
            UPDATE student_groups sg
            JOIN group_history gh ON sg.group_id = gh.group_id
            JOIN courses c ON gh.course_id = c.course_id
            SET sg.status = 'archived'
            WHERE gh.year_id = ?
            AND c.course_name IN ('Бакалавриат 4 курс', 'Магистратура 2 курс')
        `, [currentYearId]);
        console.log('done 3');

        // 4. Создаем новый учебный год
        // const [newYear] = await db.query(`
        //     INSERT INTO academic_years (year, is_current)
        //     VALUES (?, TRUE)
        // `, [nextYear]);
        // console.log('done 4');

        // 5. Деактивируем старый год
        // await db.query(`
        //     UPDATE academic_years 
        //     SET is_current = FALSE 
        //     WHERE year_id = ?
        // `, [currentYearId]);
        // console.log('done 5');


        res.json({
            success: true,
            message: 'Обработка успешно завершена'
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: 'Ошибка при обработке'
        });
    }
};

// Получение студентов в академотпуске
exports.getAcademicLeaveStudents = async (req, res) => {
    console.log('Получение студентов в академ-отпуске');

    try {
        const { yearId } = req.params;

        const [students] = await db.query(`
            SELECT 
                s.student_id,
                s.full_name,
                sg.group_number,
                c.course_name,
                sh.history_id
            FROM students s
            JOIN academic_leaves al ON s.student_id = al.student_id
            JOIN student_history sh ON al.start_history_id = sh.history_id
            JOIN group_history gh ON sh.group_id = gh.group_id
            JOIN student_groups sg ON sh.group_id = sg.group_id
            JOIN courses c ON gh.course_id = c.course_id
            JOIN semesters sm ON sh.semester_id = sm.semester_id
            WHERE s.status = 'academic_leave'
            AND gh.year_id = ?
            AND sm.semester_number = '1'  -- Добавляем условие для первого семестра
        `, [yearId]);

        res.json({
            success: true,
            data: students
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: 'Ошибка при получении студентов в академотпуске'
        });
    }
};

// Обработка решений по академотпускам
exports.processAcademicLeaves = async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection(); // Получаем соединение для транзакции
    await connection.beginTransaction();

    const { yearId, decisions = [] } = req.body;

    for (const decision of decisions) {
      if (decision.action === 'continue') {
        await connection.query(`
          UPDATE students 
          SET status = 'studying' 
          WHERE student_id = ?
        `, [decision.student_id]);

        await connection.query(`
          DELETE FROM academic_leaves 
          WHERE student_id = ?
        `, [decision.student_id]);

      } else if (decision.action === 'expel') {
        await connection.query(`
          UPDATE students 
          SET status = 'expelled' 
          WHERE student_id = ?
        `, [decision.student_id]);
      }
      // Для продления академа ничего не делаем
    }

    // Если нужно, тут можно добавить запрос на архивирование групп

    await connection.commit();
    res.json({
      success: true,
      message: 'Решения по академотпускам применены'
    });

  } catch (err) {
    if (connection) await connection.rollback();
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Ошибка при обработке решений'
    });
  } finally {
    if (connection) connection.release();
  }
};


// Получение студентов для перевода
exports.getContinuingStudents = async (req, res) => {
    console.log('Получение студентов для перевода');
    try {
        const { yearId } = req.params;

        // Получаем группы, которые продолжают обучение
        const [groups] = await db.query(`
            SELECT 
                gh.group_id,
                sg.group_number,
                c.course_name AS current_course,
                CASE 
                    WHEN c.course_name = 'Бакалавриат 1 курс' THEN 'Бакалавриат 2 курс'
                    WHEN c.course_name = 'Бакалавриат 2 курс' THEN 'Бакалавриат 3 курс'
                    WHEN c.course_name = 'Бакалавриат 3 курс' THEN 'Бакалавриат 4 курс'
                    WHEN c.course_name = 'Магистратура 1 курс' THEN 'Магистратура 2 курс'
                END AS next_course
            FROM group_history gh
            JOIN student_groups sg ON gh.group_id = sg.group_id
            JOIN courses c ON gh.course_id = c.course_id
            WHERE gh.year_id = ?
            AND c.course_name IN ('Бакалавриат 1 курс', 'Бакалавриат 2 курс', 'Бакалавриат 3 курс', 'Магистратура 1 курс')
            AND sg.status = 'active'
        `, [yearId]);

        // Для каждой группы получаем студентов
        const result = await Promise.all(groups.map(async group => {
            const [students] = await db.query(`
                SELECT 
                    s.student_id,
                    s.full_name,
                    s.status
                FROM student_history sh
                JOIN students s ON sh.student_id = s.student_id
                WHERE sh.group_id = ?
                AND sh.year_id = ?
                AND sh.status = 'active'
                AND s.status = 'studying'
            `, [group.group_id, yearId]);

            return {
                ...group,
                students: students.map(s => ({
                    ...s,
                    action: 'continue', // По умолчанию - перевести
                    new_group_id: null // Для варианта перевода в другую группу
                }))
            };
        }));

        res.json({
            success: true,
            data: result
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: 'Ошибка при получении студентов для перевода'
        });
    }
};

// Получение доступных групп для перевода студентов
exports.getAvailableGroups = async (req, res) => {
    try {
        const { yearId } = req.params;

        // Получаем группы, которые будут в новом учебном году
        const [groups] = await db.query(`
            SELECT 
                sg.group_id,
                sg.group_number,
                c.course_name,
                c.course_id
            FROM group_history gh
            JOIN student_groups sg ON gh.group_id = sg.group_id
            JOIN courses c ON gh.course_id = c.course_id
            WHERE gh.year_id = ?
            AND sg.status = 'active'
            AND c.course_name NOT IN ('Бакалавриат 4 курс', 'Магистратура 2 курс')
        `, [yearId]);

        res.json({
            success: true,
            data: groups.map(group => ({
                ...group,
                // Добавляем следующий курс для отображения
                next_course: group.course_name.replace(/(\d+)/,
                    match => parseInt(match) + 1)
            }))
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: 'Ошибка при получении списка групп'
        });
    }
};

// новый год + обработка студентов
exports.studentProcessing = async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    const { currentYearId, nextYear, transitions = [] } = req.body;

    // 1. Создаем новый учебный год
    const [newYear] = await connection.query(`
      INSERT INTO academic_years (year, is_current)
      VALUES (?, TRUE)
    `, [nextYear]);
    const newYearId = newYear.insertId;
    console.log('done 1');

    // 2. Деактивируем старый год
    await connection.query(`
      UPDATE academic_years 
      SET is_current = FALSE 
      WHERE year_id = ?
    `, [currentYearId]);
    console.log('done 2');

    // 3. Архивируем старые записи student_history
    await connection.query(`
      UPDATE student_history
      SET status = 'archived'
      WHERE year_id = ?
      AND status = 'active'
    `, [currentYearId]);
    console.log('done 3');

    // 4. Обрабатываем перевод студентов
    for (const transition of transitions) {
      if (transition.action === 'continue' || transition.action === 'transfer') {
        const targetGroupId = transition.action === 'transfer'
          ? transition.new_group_id
          : transition.current_group_id;

        await connection.query(`
          INSERT INTO student_history 
          (student_id, group_id, year_id, semester_id, status)
          VALUES (?, ?, ?, 
            (SELECT semester_id FROM semesters WHERE semester_number = '1'), 
            'active')
        `, [
          transition.student_id,
          targetGroupId,
          newYearId
        ]);
      }
      else if (transition.action === 'academic_leave') {
        const [history] = await connection.query(`
          INSERT INTO student_history 
          (student_id, group_id, year_id, semester_id, status)
          VALUES (?, ?, ?, 
            (SELECT semester_id FROM semesters WHERE semester_number = '1'), 
            'active')
        `, [
          transition.student_id,
          transition.current_group_id,
          newYearId
        ]);

        await connection.query(`
          INSERT INTO academic_leaves (student_id, start_history_id)
          VALUES (?, ?)
        `, [transition.student_id, history.insertId]);

        await connection.query(`
          UPDATE students 
          SET status = 'academic_leave' 
          WHERE student_id = ?
        `, [transition.student_id]);
      }
      else if (transition.action === 'expel') {
        await connection.query(`
          UPDATE students 
          SET status = 'expelled' 
          WHERE student_id = ?
        `, [transition.student_id]);
      }
    }
    console.log('done 4');

    await connection.commit();
    res.json({
      success: true,
      message: 'Переход на новый учебный год успешно завершен'
    });

  } catch (err) {
    if (connection) await connection.rollback();
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Ошибка при завершении перехода'
    });
  } finally {
    if (connection) connection.release();
  }
};


const XLSX = require('xlsx');

// Валидация названия группы
const validateGroupName = (name) => {
    return /^\d{7}\/\d{5}$/.test(name);
};

// Добавление группы вручную
exports.addManualGroup = async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    const { groupName, students, yearId, isMaster = false } = req.body;

    const [year] = await connection.query(`
      SELECT year_id FROM academic_years WHERE is_current = TRUE;
    `);

    const year_id = year[0].year_id;

    // 1. Проверяем название группы
    if (!validateGroupName(groupName)) {
      throw new Error('Некорректное название группы');
    }

    // 2. Создаем новую группу
    const [group] = await connection.query(`
      INSERT INTO student_groups (group_number, status)
      VALUES (?, 'active')
    `, [groupName]);

    // 3. Определяем курс в зависимости от флага isMaster
    const courseName = isMaster ? 'Магистратура 1 курс' : 'Бакалавриат 1 курс';

    // 4. Добавляем группу в историю (1 курс, 1 семестр)
    await connection.query(`
      INSERT INTO group_history (group_id, year_id, semester_id, course_id)
      VALUES (?, ?, 
        (SELECT semester_id FROM semesters WHERE semester_number = '1'),
        (SELECT course_id FROM courses WHERE course_name = ?)
      )
    `, [group.insertId, year_id, courseName]);

    // 4. Добавляем студентов
    for (const studentName of students) {
      const [student] = await connection.query(`
        INSERT INTO students (full_name, status)
        VALUES (?, 'studying')
      `, [studentName]);

      await connection.query(`
        INSERT INTO student_history (student_id, group_id, year_id, semester_id, status)
        VALUES (?, ?, ?, 
          (SELECT semester_id FROM semesters WHERE semester_number = '1'), 
          'active')
      `, [student.insertId, group.insertId, year_id]);
    }

    await connection.commit();

    res.json({ success: true, groupId: group.insertId });

  } catch (err) {
    if (connection) await connection.rollback();
    console.error(err);
    res.status(500).json({
      success: false,
      message: err.message || 'Ошибка при создании группы'
    });
  } finally {
    if (connection) connection.release();
  }
};

// Парсинг Excel файла
exports.parseExcelGroup = async (req, res) => {
    try {
        if (!req.file) {
            throw new Error('Файл не загружен');
        }

        const workbook = XLSX.read(req.file.buffer);
        const result = [];

        for (const sheetName of workbook.SheetNames) {
            const worksheet = workbook.Sheets[sheetName];
            const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

            // Фильтруем и валидируем данные
            const students = data
                .filter(row => row[1] && typeof row[1] === 'string') // Проверяем наличие ФИО
                .map((row, index) => ({
                    number: index + 1, // Автонумерация
                    full_name: row[1].trim() // Берем ФИО из второй колонки
                }));

            if (students.length > 0) {
                result.push({
                    sheetName,
                    proposedGroupName: sheetName,
                    students
                });
            }
        }


        if (result.length === 0) {
            throw new Error('Не найдено ни одной группы с данными студентов');
        }

        res.json({
            success: true,
            data: result
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: err.message || 'Ошибка при обработке файла'
        });
    }
};


exports.completeTransition = async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    const { currentYearId, nextYear } = req.body;
    console.log(currentYearId);
    console.log(nextYear);

    // 1. Архивируем старые связи group_subjects
    await connection.query(`
      UPDATE group_subjects
      SET status = 'archived'
      WHERE group_id IN (
        SELECT group_id FROM group_history 
        WHERE year_id = ?
      )
    `, [currentYearId]);

    // 2. Получаем новый год
    const [year_for_id] = await connection.query(
      'SELECT year_id FROM academic_years WHERE year = ? LIMIT 1',
      [nextYear]
    );

    if (!year_for_id.length) {
      throw new Error('Новый учебный год не найден');
    }
    const newYearId_ = year_for_id[0].year_id;
    console.log(newYearId_);

    // 3. Добавляем новые связи group_history
    await connection.query(`
      INSERT INTO group_history (group_id, year_id, semester_id, course_id)
      SELECT 
        gh.group_id,
        ?,
        (SELECT semester_id FROM semesters WHERE semester_number = '1'),
        (SELECT course_id FROM courses WHERE course_name = 
          CASE c.course_name
            WHEN 'Бакалавриат 1 курс' THEN 'Бакалавриат 2 курс'
            WHEN 'Бакалавриат 2 курс' THEN 'Бакалавриат 3 курс'
            WHEN 'Бакалавриат 3 курс' THEN 'Бакалавриат 4 курс'
            WHEN 'Магистратура 1 курс' THEN 'Магистратура 2 курс'
          END)
      FROM group_history gh
      JOIN courses c ON gh.course_id = c.course_id
      WHERE gh.year_id = ?
      AND c.course_name IN ('Бакалавриат 1 курс', 'Бакалавриат 2 курс', 'Бакалавриат 3 курс', 'Магистратура 1 курс')
      GROUP BY gh.group_id, c.course_id
    `, [newYearId_, currentYearId]);

    // 4. Добавляем новые связи group_subjects
    await connection.query(`
      INSERT INTO group_subjects (group_id, course_subject_id, status)
      SELECT 
        gh.group_id,
        cs.course_subject_id,
        'active'
      FROM group_history gh
      JOIN courses new_c ON gh.course_id = new_c.course_id
      JOIN course_subjects cs ON cs.course_id = new_c.course_id
        AND cs.semester_id = (
          SELECT semester_id 
          FROM semesters 
          WHERE semester_number = '1'
        )
      WHERE gh.year_id = ?
      AND NOT EXISTS (
        SELECT 1 
        FROM group_subjects gs 
        WHERE gs.group_id = gh.group_id 
        AND gs.course_subject_id = cs.course_subject_id
      )
    `, [newYearId_]);

    // 5. Создаем новый аттестационный месяц (сентябрь)
    const [year] = await connection.query(`
      SELECT year_id FROM academic_years 
      WHERE year = ?
      LIMIT 1
    `, [nextYear]);

    if (!year.length) {
      throw new Error('Новый учебный год не найден');
    }
    const newYearId = year[0].year_id;

    const [newMonth] = await connection.query(`
      INSERT INTO active_months 
      (year_id, month, is_attestation_month)
      VALUES (?, '9', TRUE)
    `, [newYearId]);

    // 6. Деактивируем прошлый аттестационный месяц
    await connection.query(`
      UPDATE active_months
      SET is_attestation_month = FALSE
      WHERE year_id = ? AND is_attestation_month = TRUE
    `, [currentYearId]);
    console.log('done 4 active_months');

    // 7. Получаем список преподавателей
    const [teachers] = await connection.query(`
      SELECT t.teacher_id, u.user_id, 
             CONCAT(u.last_name, ' ', u.first_name, ' ', IFNULL(u.middle_name, '')) AS full_name
      FROM teachers t
      JOIN users u ON t.user_id = u.user_id
    `);

    // 8. Получаем список предметов
    const [subjects] = await connection.query(`
      SELECT s.subject_id, s.subject_name
      FROM subjects s
      JOIN course_subjects cs ON s.subject_id = cs.subject_id
      JOIN group_subjects gs ON cs.course_subject_id = gs.course_subject_id
      WHERE gs.status = 'active'
    `);
    console.log(subjects);

    await connection.commit();

    res.json({
      success: true,
      data: {
        teachers,
        subjects
      }
    });

  } catch (err) {
    if (connection) await connection.rollback();
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Ошибка при завершении перехода'
    });
  } finally {
    if (connection) connection.release();
  }
};

exports.assignTeachers = async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    const { assignments = [] } = req.body;

    console.log(assignments);

    // Назначаем преподавателей
    for (const assignment of assignments) {
      await connection.query(`
        INSERT INTO teacher_assignments 
        (teacher_id, group_subject_id)
        VALUES (?, ?)
      `, [
        assignment.teacher_id,
        assignment.group_subject_id
      ]);
    }

    await connection.commit();

    res.json({ success: true });

  } catch (err) {
    if (connection) await connection.rollback();
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Ошибка при назначении преподавателей'
    });
  } finally {
    if (connection) connection.release();
  }
};

exports.getActiveGroupSubjects = async (req, res) => {
    try {
        const [groupSubjects] = await db.query(`
            SELECT 
            gs.group_subject_id, 
            gs.group_id, 
            sg.group_number, 
            s.subject_id, 
            s.subject_name
            FROM group_subjects gs
            JOIN course_subjects cs ON gs.course_subject_id = cs.course_subject_id
            JOIN subjects s ON cs.subject_id = s.subject_id
            JOIN student_groups sg ON gs.group_id = sg.group_id
            WHERE gs.status = 'active'
        `);

        res.json({ success: true, data: groupSubjects });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
};

exports.initializeGrades = async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    const { yearId } = req.body;

    const [year] = await connection.query(`
      SELECT year_id FROM academic_years WHERE is_current = true;
    `);

    if (!year.length) {
      throw new Error('Текущий учебный год не найден');
    }

    const year_id = year[0].year_id;

    // Получаем активный месяц (сентябрь)
    const [month] = await connection.query(`
      SELECT month_id, month FROM active_months WHERE is_attestation_month = true;
    `);

    if (!month.length) {
      throw new Error('Активный месяц не найден');
    }

    const monthId = month[0].month_id;
    const month_ = month[0].month;

    // Добавляем пустые оценки для всех активных студентов
    await connection.query(`
      INSERT INTO grades (student_history_id, group_subject_id, month_id, last_edited_by, grade)
      SELECT 
          sh.history_id,
          gs.group_subject_id,
          ?,
          NULL,
          NULL
      FROM student_history sh
      JOIN group_subjects gs ON sh.group_id = gs.group_id
      JOIN active_months am ON am.year_id = sh.year_id AND am.month = ?
      WHERE sh.year_id = ?
      AND sh.status = 'active'
      AND gs.status = 'active'
      AND NOT EXISTS (
          SELECT 1 
          FROM grades g
          WHERE g.student_history_id = sh.history_id
          AND g.group_subject_id = gs.group_subject_id
          AND g.month_id = ?
      )
    `, [monthId, month_, year_id, monthId]);

    await connection.commit();
    res.json({ success: true });

  } catch (err) {
    if (connection) await connection.rollback();
    console.error(err);
    res.status(500).json({
      success: false,
      message: err.message || 'Ошибка при инициализации оценок'
    });
  } finally {
    if (connection) connection.release();
  }
};