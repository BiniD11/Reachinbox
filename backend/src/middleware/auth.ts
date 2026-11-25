import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import prisma from '../lib/prisma';

declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      name: string;
      avatar?: string | null;
    }
  }
}

export type AuthRequest = Request;

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = req.headers.authorization?.split(' ')[1] || (req as any).cookies?.token;
    
    if (!token) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    
    const decoded = jwt.verify(token, config.jwt.secret) as { id: string };
    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    
    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }
    
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar || undefined,
    };
    
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
}
