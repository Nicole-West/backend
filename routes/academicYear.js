const express = require('express');
const router = express.Router();
const academicYearController = require('../controllers/academicYearController');

const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

const checkAdmin = require('../middleware/checkAdmin');

// Получение информации о текущем годе для перехода
router.get('/transition-info', checkAdmin, academicYearController.getCurrentYearInfo);

router.get('/graduating-students/:yearId', checkAdmin, academicYearController.getGraduatingStudents);
router.post('/process-transition', checkAdmin, academicYearController.processTransition);

router.get('/students/academic-leaves/:yearId', checkAdmin, academicYearController.getAcademicLeaveStudents);
router.post('/students/process-academic-leaves', checkAdmin, academicYearController.processAcademicLeaves);
router.get('/students/continuing/:yearId', checkAdmin, academicYearController.getContinuingStudents);
router.get('/groups/available/:yearId', checkAdmin, academicYearController.getAvailableGroups);
router.post('/student-processing', checkAdmin, academicYearController.studentProcessing);

router.post('/available-groups', checkAdmin, academicYearController.getAvailableGroups2);


router.post('/process-academic-leaves', checkAdmin, academicYearController.processAcademicLeaves);
router.post('/groups/manual', checkAdmin, upload.none(), academicYearController.addManualGroup);
router.post('/groups/parse-excel', checkAdmin, upload.single('file'), academicYearController.parseExcelGroup);


router.post('/complete-transition', checkAdmin, academicYearController.completeTransition);
router.post('/assign', checkAdmin, academicYearController.assignTeachers);
router.get('/group-subjects/active', checkAdmin, academicYearController.getActiveGroupSubjects);

router.post('/grades/initialize', checkAdmin, academicYearController.initializeGrades);

module.exports = router;