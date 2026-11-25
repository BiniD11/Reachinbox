import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { createTransporter } from '../lib/ethereal';

const router = Router();

// List senders
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  const senders = await prisma.emailSender.findMany({
    where: { userId: req.user!.id },
    select: { id: true, email: true, name: true, host: true, port: true, createdAt: true },
  });
  res.json({ senders });
});

// Create Ethereal sender (auto)
router.post('/ethereal', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const transporter = await createTransporter();
    const info = transporter.options as any;
    
    const sender = await prisma.emailSender.create({
      data: {
        userId: req.user!.id,
        email: info.auth.user,
        name: req.body.name || 'Ethereal Test Sender',
        host: info.host,
        port: info.port,
        secure: info.secure || false,
        user: info.auth.user,
        password: info.auth.pass,
      },
    });
    
    res.json({ sender: { id: sender.id, email: sender.email, name: sender.name } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create custom sender
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { email, name, host, port, secure, user, password } = req.body;
    
    const sender = await prisma.emailSender.create({
      data: {
        userId: req.user!.id,
        email,
        name,
        host,
        port: parseInt(port),
        secure: Boolean(secure),
        user,
        password,
      },
    });
    
    res.json({ sender: { id: sender.id, email: sender.email, name: sender.name } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete sender
router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.emailSender.deleteMany({
      where: { id: req.params.id, userId: req.user!.id },
    });
    res.json({ message: 'Sender deleted' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
