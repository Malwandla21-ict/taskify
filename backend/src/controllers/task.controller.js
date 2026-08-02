const { validationResult } = require("express-validator");
const taskService = require("../services/task.service");

async function createTask(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: "Validation failed.", errors: errors.array() });

    const task = await taskService.createTask({
      title: req.body.title, description: req.body.description,
      category: req.body.category, section: req.body.section,
      price: req.body.price, location: req.body.location,
      urgent: req.body.urgent, createdBy: req.user.id,
      imageUrls: req.body.imageUrls || []
    });

    return res.status(201).json({ success: true, message: "Task created successfully.", data: task });
  } catch (error) { next(error); }
}

async function getAllTasks(req, res, next) {
  try {
    const tasks = await taskService.getAllTasks();
    return res.status(200).json({ success: true, message: "Tasks fetched successfully.", data: tasks });
  } catch (error) { next(error); }
}

async function acceptTask(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: "Validation failed.", errors: errors.array() });

    const task = await taskService.acceptTask(Number(req.params.id), req.user.id);
    return res.status(200).json({ success: true, message: "Task accepted successfully.", data: task });
  } catch (error) { next(error); }
}

async function updateTaskStatus(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: "Validation failed.", errors: errors.array() });

    const task = await taskService.updateTaskStatus(Number(req.params.id), req.user.id, req.body.status);
    return res.status(200).json({ success: true, message: "Task status updated successfully.", data: task });
  } catch (error) { next(error); }
}

async function cancelTask(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: "Validation failed.", errors: errors.array() });

    const task = await taskService.cancelTask(Number(req.params.id), req.user.id);
    return res.status(200).json({ success: true, message: "Task cancelled successfully.", data: task });
  } catch (error) { next(error); }
}

async function getUserTaskHistory(req, res, next) {
  try {
    const tasks = await taskService.getUserTaskHistory(req.user.id);
    return res.status(200).json({ success: true, message: "Task history fetched successfully.", data: tasks });
  } catch (error) { next(error); }
}

async function deleteTask(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: "Validation failed.", errors: errors.array() });

    await taskService.deleteTask(Number(req.params.id), req.user.id);
    return res.status(200).json({ success: true, message: "Task deleted successfully." });
  } catch (error) { next(error); }
}

module.exports = { createTask, getAllTasks, acceptTask, updateTaskStatus, cancelTask, getUserTaskHistory, deleteTask };