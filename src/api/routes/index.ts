import { Router } from 'express';
import { getCampaignRecipients, getCampaigns } from '../controllers/campaign.controller';
import { initiateBlast } from '../controllers/blast.controller';
import { getSessions, connectSession, logoutSession } from '../controllers/session.controller';
import * as sessionConfigController from '../controllers/sessionConfig.controller';
import * as ticketController from '../controllers/ticket.controller';
import { swaggerDocs } from './swagger';
import multer from 'multer';

const router = Router();

router.use('/docs', ...swaggerDocs);

const upload = multer({ storage: multer.memoryStorage() });

/**
 * @openapi
 * /api/campaigns:
 *   get:
 *     tags:
 *       - Campaigns
 *     summary: Retrieve the list of all available campaigns
 *     responses:
 *       200:
 *         description: A JSON array of campaigns
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   name:
 *                     type: string
 */
router.get('/campaigns', getCampaigns);

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
 *               recipientsFile:
 *                 type: string
 *                 format: binary
 *                 description: Optional Excel file containing recipients
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
router.post('/blasts', upload.fields([
  { name: 'recipientsFile', maxCount: 1 },
  { name: 'media', maxCount: 1 },
]), initiateBlast);

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
 *                     enum: [CONNECTED, DISCONNECTED, AWAITING_QR, CONNECTING, LOGGED_OUT, TIMEOUT]
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

/**
 * @openapi
 * /api/sessions/{sessionId}/logout:
 *   post:
 *     tags:
 *       - Sessions
 *     summary: Logout a specific WhatsApp session
 *     parameters:
 *       - name: sessionId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Logout process initiated
 */
router.post('/sessions/:sessionId/logout', logoutSession);
/**
 * @openapi
 * /api/sessions/config:
 *   get:
 *     tags:
 *       - Session Configuration
 *     summary: Get all session configurations
 *     responses:
 *       200:
 *         description: A list of all session configurations.
 */
router.get('/sessions/config', sessionConfigController.getSessions);

/**
 * @openapi
 * /api/sessions/config:
 *   post:
 *     tags:
 *       - Session Configuration
 *     summary: Create a new session configuration
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *               - friendlyName
 *             properties:
 *               id:
 *                 type: string
 *                 description: The unique identifier for the session.
 *                 example: "a1b2c3d4-e5f6-7890-g1h2-i3j4k5l6m7n8"
 *               friendlyName:
 *                 type: string
 *                 description: A user-friendly name for the session configuration.
 *                 example: "Q4 Marketing Campaign"
 *               businessUnit:
 *                 type: string
 *                 description: The business unit associated with the session.
 *                 example: "Marketing"
 *     responses:
 *       '201':
 *         description: The created session configuration.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   example: "a1b2c3d4-e5f6-7890-g1h2-i3j4k5l6m7n8"
 *                 friendlyName:
 *                   type: string
 *                   example: "Q4 Marketing Campaign"
 *                 businessUnit:
 *                   type: string
 *                   example: "Marketing"
 */
router.post('/sessions/config', sessionConfigController.createSession);

/**
 * @openapi
 * /api/sessions/config/{id}:
 *   get:
 *     tags:
 *       - Session Configuration
 *     summary: Get a session configuration by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: The requested session configuration.
 */
router.get('/sessions/config/:id', sessionConfigController.getSession);

/**
 * @openapi
 * /api/sessions/config/{id}:
 *   put:
 *     tags:
 *       - Session Configuration
 *     summary: Update a session configuration
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SessionConfig'
 *     responses:
 *       200:
 *         description: The updated session configuration.
 */
router.put('/sessions/config/:id', sessionConfigController.updateSession);

/**
 * @openapi
 * /api/sessions/config/{id}:
 *   delete:
 *     tags:
 *       - Session Configuration
 *     summary: Delete a session configuration
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: The session configuration was deleted successfully.
 */
router.delete('/sessions/config/:id', sessionConfigController.deleteSession);

/**
 * @openapi
 * /api/ws-ticket:
 *   get:
 *     tags:
 *       - WebSocket
 *     summary: Get a ticket for WebSocket authentication
 *     parameters:
 *       - in: query
 *         name: blastId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: A WebSocket ticket for authentication.
 */
router.get('/ws-ticket', ticketController.generateTicket);

export default router;
