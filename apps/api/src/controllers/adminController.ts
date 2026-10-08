import type { RequestHandler } from 'express';
import { z } from 'zod';
import {
  createUserRequestSchema,
  updateUserRequestSchema,
  type ActivityResponse,
  type AdminAnalytics,
  type AdminUserResponse,
  type AdminUsersResponse,
  type AuditSimulationsResponse,
  type SavedRunResponse,
} from '@mindspark/shared';
import type { AnalyticsService } from '../services/analytics/analyticsService.js';
import type { AuditService } from '../services/audit/auditService.js';
import type { UserAdminService } from '../services/auth/userAdminService.js';
import { AppError } from '../utils/errors.js';

export interface AdminController {
  listUsers: RequestHandler<unknown, AdminUsersResponse>;
  createUser: RequestHandler<unknown, AdminUserResponse>;
  updateUser: RequestHandler<{ id: string }, AdminUserResponse>;
  analytics: RequestHandler<unknown, AdminAnalytics>;
  activity: RequestHandler<unknown, ActivityResponse>;
}

const activityLimitSchema = z.coerce.number().int().min(1).optional();

export function createAdminController(
  service: UserAdminService,
  analytics: AnalyticsService,
): AdminController {
  return {
    listUsers: async (_req, res) => {
      res.json({ users: await service.list() });
    },
    createUser: async (req, res) => {
      const user = await service.create(createUserRequestSchema.parse(req.body), req.auth!.userId);
      res.status(201).json({ user });
    },
    updateUser: async (req, res) => {
      const id = z.uuid().safeParse(req.params.id);
      if (!id.success) throw new AppError('NOT_FOUND', 'User not found');
      const user = await service.update(
        req.auth!.userId,
        id.data,
        updateUserRequestSchema.parse(req.body),
      );
      res.json({ user });
    },
    analytics: async (_req, res) => {
      res.json(await analytics.overview());
    },
    activity: async (req, res) => {
      const limit = activityLimitSchema.parse(req.query.limit);
      res.json({ events: await analytics.recentActivity(limit) });
    },
  };
}

export interface AuditController {
  listSimulations: RequestHandler<unknown, AuditSimulationsResponse>;
  getSimulation: RequestHandler<{ id: string }, SavedRunResponse>;
}

const limitSchema = z.coerce.number().int().min(1).optional();

export function createAuditController(service: AuditService): AuditController {
  return {
    listSimulations: async (req, res) => {
      const limit = limitSchema.parse(req.query.limit);
      res.json({ simulations: await service.recentSimulations(limit) });
    },
    getSimulation: async (req, res) => {
      res.json({ run: await service.simulation(req.params.id) });
    },
  };
}
