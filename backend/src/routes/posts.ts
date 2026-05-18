import { Router, Response } from 'express';
import { pool } from '../db';
import { requireAuth, optionalAuth, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/', optionalAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const { category, author, search, page = '1', limit = '20' } = req.query;
  const pageNum = Math.max(1, parseInt(page as string));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)));
  const offset = (pageNum - 1) * limitNum;
  const uid = req.user?.userId ?? null;

  try {
    const filterConditions: string[] = [];
    const filterParams: unknown[] = [];
    let fi = 1;

    if (category){ 
      filterConditions.push(`p.category = $${fi++}`); 
      filterParams.push(category); }
    if (author){
       filterConditions.push(`u.username = $${fi++}`);
       filterParams.push(author); }
    if (search){
       filterConditions.push(`(p.title ILIKE $${fi} OR p.content ILIKE $${fi})`); 
       filterParams.push(`%${search}%`); 
       fi++; }

    const whereClause = filterConditions.length
      ? 'WHERE ' + filterConditions.join(' AND ')
      : '';

    const likedExpr = uid !== null
      ? `EXISTS(SELECT 1 FROM likes WHERE post_id = p.id AND user_id = ${uid})`
      : 'FALSE';

    const mainParams = [...filterParams, limitNum, offset];
    const limitIdx = fi;
    const offsetIdx = fi + 1;

    const { rows } = await pool.query(
      `SELECT p.id, p.title, p.excerpt,
        LEFT(p.content, 300) AS content_preview,
        p.category, p.tags, p.created_at, p.updated_at,
        u.id AS author_id,
        u.username, u.display_name,
        COUNT(DISTINCT c.id)::int AS comment_count,
        COUNT(DISTINCT l.user_id)::int AS like_count,
        ${likedExpr} AS liked
       FROM posts p
       JOIN users u ON u.id = p.author_id
       LEFT JOIN comments c ON c.post_id = p.id
       LEFT JOIN likes l ON l.post_id = p.id
       ${whereClause}
       GROUP BY p.id, u.id
       ORDER BY p.created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      mainParams
    );

    res.json({posts: rows, total: rows.length});
  } catch (err) {
    console.error(err);
    res.status(500).json({error:'Server error'});
  }
});

router.get('/:id', optionalAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const uid = req.user?.userId ?? null;
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.title, p.content, p.excerpt,
        p.category, p.tags, p.created_at, p.updated_at,
        u.id AS author_id, u.username, u.display_name, u.bio AS author_bio,
        COUNT(DISTINCT l.user_id)::int AS like_count,
        EXISTS(SELECT 1 FROM likes WHERE post_id = p.id AND user_id = $1) AS liked
       FROM posts p
       JOIN users u ON u.id = p.author_id
       LEFT JOIN likes l ON l.post_id = p.id
       WHERE p.id = $2
       GROUP BY p.id, u.id`,
      [uid, req.params.id]
    );
    if (!rows[0]) { 
      res.status(404).json({error:'Post not found'}); 
      return; }
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({error:'Server error'});
  }
});
 
router.post('/', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const { title, content, category = 'General', tags = '' } = req.body;
  if (!title?.trim() || !content?.trim()) {
    res.status(400).json({error:'title and content are required'});
    return;
  }
  const excerpt = content.replace(/[#*>\-`]/g, '').slice(0, 200).trim() + (content.length > 200 ? '…' : '');
  try {
    const { rows } = await pool.query(
      `INSERT INTO posts (title, content, excerpt, category, tags, author_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [title.trim(), content.trim(), excerpt, category, tags, req.user!.userId]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({error:'Server error'});
  }
});

router.put('/:id', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const { title, content, category, tags } = req.body;
  try {
    const { rows: existing } = await pool.query('SELECT author_id FROM posts WHERE id = $1', [req.params.id]);
    if (!existing[0]) { 
      res.status(404).json({error:'Post not found'}); 
      return; }
    if (existing[0].author_id !== req.user!.userId) { 
      res.status(403).json({error:'Not your post'}); 
      return; }

    const excerpt = content
      ? content.replace(/[#*>\-`]/g, '').slice(0, 200).trim() + (content.length > 200 ? '…' : '')
      : undefined;

    const { rows } = await pool.query(
      `UPDATE posts SET
        title = COALESCE($1, title),
        content = COALESCE($2, content),
        excerpt = COALESCE($3, excerpt),
        category = COALESCE($4, category),
        tags = COALESCE($5, tags)
       WHERE id = $6 RETURNING *`,
      [title, content, excerpt, category, tags, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({error:'Server error'});
  }
});

router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { rows } = await pool.query('SELECT author_id FROM posts WHERE id = $1', [req.params.id]);
    if (!rows[0]) { 
      res.status(404).json({error:'Post not found'}); 
      return; }
    if (rows[0].author_id !== req.user!.userId) { 
      res.status(403).json({error:'Not your post'}); 
      return; }
    await pool.query('DELETE FROM posts WHERE id = $1', [req.params.id]);
    res.json({message:'Post deleted'});
  } catch (err) {
    console.error(err);
    res.status(500).json({error:'Server error'});
  }
});

router.post('/:id/like', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const uid = req.user!.userId;
  const pid = parseInt(req.params.id);
  try {
    const { rows } = await pool.query(
      'SELECT 1 FROM likes WHERE user_id = $1 AND post_id = $2', [uid, pid]
    );
    if (rows.length) {
      await pool.query('DELETE FROM likes WHERE user_id = $1 AND post_id = $2', [uid, pid]);
    } else {
      await pool.query('INSERT INTO likes (user_id, post_id) VALUES ($1, $2)', [uid, pid]);
    }
    const { rows: cnt } = await pool.query(
      'SELECT COUNT(*)::int AS like_count FROM likes WHERE post_id = $1', [pid]
    );
    res.json({ liked: !rows.length, like_count: cnt[0].like_count });
  } catch (err) {
    console.error(err);
    res.status(500).json({error:'Server error'});
  }
});

router.get('/:id/comments', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { rows } = await pool.query(
      `SELECT c.id, c.content, c.created_at,
        u.id AS author_id, u.username, u.display_name
       FROM comments c
       JOIN users u ON u.id = c.author_id
       WHERE c.post_id = $1
       ORDER BY c.created_at ASC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({error:'Server error'});
  }
});

router.post('/:id/comments', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const { content } = req.body;
  if (!content?.trim()) { 
    res.status(400).json({error:'content is required'}); 
    return; }
  try {
    const { rows } = await pool.query(
      `INSERT INTO comments (post_id, author_id, content) VALUES ($1, $2, $3)
       RETURNING id, content, created_at`,
      [req.params.id, req.user!.userId, content.trim()]
    );
    const c = rows[0];
    res.status(201).json({
      ...c,
      author_id: req.user!.userId,
      username: req.user!.username,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({error:'Server error'});
  }
});

router.delete('/:id/comments/:cid', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { rows } = await pool.query('SELECT author_id FROM comments WHERE id = $1', [req.params.cid]);
    if (!rows[0]) { 
      res.status(404).json({error:'Comment not found'}); 
      return; }
    if (rows[0].author_id !== req.user!.userId) { 
      res.status(403).json({error:'Not your comment'}); 
      return; }
    await pool.query('DELETE FROM comments WHERE id = $1', [req.params.cid]);
    res.json({message:'Comment deleted'});
  } catch (err) {
    console.error(err);
    res.status(500).json({error:'Server error'});
  }
});

export default router;