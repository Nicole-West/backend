const express = require('express');
const router = express.Router();
const semesterTransitionController = require('../controllers/nextSemesterController');

router.get('/init', semesterTransitionController.init);
router.post('/deactivate-month', semesterTransitionController.deactivateMonth);
router.post('/add-month', semesterTransitionController.addMonth);
router.get('/academic-leaves', semesterTransitionController.getAcademicLeaves);
router.post('/process-academic-leaves', semesterTransitionController.processAcademicLeaves);

router.get('/available-groups', semesterTransitionController.getAvailableGroups);
router.get('/current-students', semesterTransitionController.getCurrentStudents);
router.post('/update-student-statuses', semesterTransitionController.updateStudentStatuses);

router.post('/process-group-subjects', semesterTransitionController.processGroupSubjects);
router.get('/teachers', semesterTransitionController.getTeachers);

router.get('/group-subjects', semesterTransitionController.getGroupSubjects);
router.post('/assign-teachers', semesterTransitionController.assignTeachers);
router.post('/initialize-grades', semesterTransitionController.initializeGrades);

module.exports = router;