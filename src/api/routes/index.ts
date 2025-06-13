import { Router } from 'express';
import { getCampaignRecipients } from '../controllers/campaign.controller';
import { initiateBlast } from '../controllers/blast.controller';
import { getSessions, connectSession } from '../controllers/session.controller';
import { swaggerDocs } from './swagger';

const router = Router();

router.use('/docs', ...swaggerDocs);

/**
 * @openapi
 * /api/campaigns/recipients:
 *   get:
 *     tags:
 *       - Campaigns
 *     summary: Retrieve the list of recipients for a specific campaign
 *     parameters:
 *       - name: campaignId
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique identifier for the campaign (e.g., october-promo)
 *     responses:
 *       200:
 *         description: A JSON array of recipients
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   phone:
 *                     type: string
 *                   name:
 *                     type: string
 */
router.get('/campaigns/recipients', getCampaignRecipients);

/**
 * @openapi
 * /api/blasts:
 *   post:
 *     tags:
 *       - Blasts
 *     summary: Initiate a messaging campaign (blast)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               campaignId:
 *                 type: string
 *                 example: october-promo
 *               sessionId:
 *                 type: string
 *                 example: marketing-promo
 *               message:
 *                 type: string
 *                 example: "Hello {name}, don't miss our October promo!"
 *     responses:
 *       202:
 *         description: Accepted for processing
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 blastId:
 *                   type: string
 */
router.post('/blasts', initiateBlast);

/**
 * @openapi
 * /api/sessions:
 *   get:
 *     tags:
 *       - Sessions
 *     summary: Get the status of all configured WhatsApp sessions
 *     responses:
 *       200:
 *         description: List of sessions and their status
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   status:
 *                     type: string
 *                     enum: [CONNECTED, DISCONNECTED, AWAITING_QR, CONNECTING]
 */
router.get('/sessions', getSessions);

/**
 * @openapi
 * /api/sessions/{sessionId}/connect:
 *   post:
 *     tags:
 *       - Sessions
 *     summary: Initiate a connection for a specific WhatsApp session
 *     parameters:
 *       - name: sessionId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Connection process initiated
 */
router.post('/sessions/:sessionId/connect', connectSession);

export default router;
