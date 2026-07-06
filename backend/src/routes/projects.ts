import { Router } from 'express';
import { db } from '../database.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

router.get('/', (_req, res) => {
  const projects = db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all();
  res.json(projects);
});

router.post('/', (req, res) => {
  const { name, biddingNumber, tenderOrg, budget, deadline, location, scope } = req.body;
  const id = uuidv4();
  db.prepare(`
    INSERT INTO projects (id, name, bidding_number, tender_org, budget, deadline, location, scope, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'parsed')
  `).run(id, name, biddingNumber, tenderOrg, budget, deadline, location, scope);
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  res.status(201).json(project);
});

router.get('/:id', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  res.json(project);
});

router.put('/:id', (req, res) => {
  const { name, biddingNumber, tenderOrg, budget, deadline, location, scope } = req.body;
  db.prepare(`
    UPDATE projects SET name=?, bidding_number=?, tender_org=?, budget=?, deadline=?, location=?, scope=?, updated_at=datetime('now') WHERE id=?
  `).run(name, biddingNumber, tenderOrg, budget, deadline, location, scope, req.params.id);
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  res.json(project);
});

export default router;
