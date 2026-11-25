import { Router } from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import prisma from '../lib/prisma';
import { handleSlackCallback, getSlackAuthUrl } from '../services/slackService';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { Response } from 'express';

const router = Router();

// Configure Google OAuth
passport.use(new GoogleStrategy(
  {
    clientID: config.google.clientId || 'missing_client_id',
    clientSecret: config.google.clientSecret || 'missing_client_secret',
    callbackURL: process.env.GOOGLE_CALLBACK_URL || '/auth/google/callback',
    proxy: true,
  },
  async (_accessToken, _refreshToken, profile, done) => {
    try {
      const email = profile.emails?.[0]?.value || '';
      const avatar = profile.photos?.[0]?.value || '';
      
      const user = await prisma.user.upsert({
        where: { googleId: profile.id },
        update: { name: profile.displayName, email, avatar },
        create: {
          googleId: profile.id,
          email,
          name: profile.displayName,
          avatar,
        },
      });
      
      done(null, user);
    } catch (err) {
      done(err as Error);
    }
  }
));

router.get('/google', passport.authenticate('google', {
  scope: ['profile', 'email'],
  session: false,
}));

router.get('/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: `${process.env.FRONTEND_URL || ''}/login?error=auth_failed` }),
  (req, res) => {
    const user = req.user as any;
    const token = jwt.sign({ id: user.id }, config.jwt.secret, { expiresIn: config.jwt.expiresIn as any });
    res.redirect(`${process.env.FRONTEND_URL || ''}/auth/callback?token=${token}`);
  }
);

router.get('/me', authMiddleware, (req: AuthRequest, res: Response) => {
  res.json({ user: req.user });
});

// Demo login for testing without needing Google OAuth credentials
router.post('/demo', async (req, res) => {
  try {
    const demoUser = await prisma.user.upsert({
      where: { googleId: 'demo-google-id-123' },
      update: {
        name: 'Demo Evaluator',
        email: 'evaluator@reachinbox.ai',
        avatar: 'https://avatars.githubusercontent.com/u/1024025?v=4',
      },
      create: {
        googleId: 'demo-google-id-123',
        name: 'Demo Evaluator',
        email: 'evaluator@reachinbox.ai',
        avatar: 'https://avatars.githubusercontent.com/u/1024025?v=4',
      },
    });

    const token = jwt.sign({ id: demoUser.id }, config.jwt.secret, { expiresIn: config.jwt.expiresIn as any });
    res.json({ token, user: demoUser });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/logout', (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

// Slack OAuth
router.get('/slack', authMiddleware, async (req: AuthRequest, res: Response) => {
  const url = await getSlackAuthUrl(req.user!.id);
  res.json({ url });
});

router.get('/slack/callback', async (req, res) => {
  try {
    const { code, state } = req.query as { code: string; state: string };
    await handleSlackCallback(code, state);
    res.redirect(`${process.env.FRONTEND_URL || ''}/dashboard?slack=connected`);
  } catch (err: any) {
    res.redirect(`${process.env.FRONTEND_URL || ''}/dashboard?slack=error&msg=${err.message}`);
  }
});

router.delete('/slack', authMiddleware, async (req: AuthRequest, res: Response) => {
  await prisma.user.update({
    where: { id: req.user!.id },
    data: { slackToken: null, slackWebhook: null, slackTeamId: null },
  });
  res.json({ message: 'Slack disconnected' });
});

export default router;
