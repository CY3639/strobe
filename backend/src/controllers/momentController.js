import * as momentService from "../services/momentService.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { HTTP_STATUS, RESPONSE_MESSAGES } from "../config/constants.js";

export const createMoment = asyncHandler(async (req, res) => {
  const moment = await momentService.createMoment(req.userId, req.body);

  res.status(HTTP_STATUS.CREATED).json({
    message: RESPONSE_MESSAGES.CREATED,
    moment,
  });
});

export const getMomentFeed = asyncHandler(async (req, res) => {
  const moments = await momentService.getMomentFeed(req.userId, req.userRole);

  res.status(HTTP_STATUS.OK).json({
    message: RESPONSE_MESSAGES.SUCCESS,
    moments,
  });
});

export const getMomentArchive = asyncHandler(async (req, res) => {
  const moments = await momentService.getMomentArchive(
    req.userId,
    req.userRole,
  );

  res.status(HTTP_STATUS.OK).json({
    message: RESPONSE_MESSAGES.SUCCESS,
    moments,
  });
});

export const hideMoment = asyncHandler(async (req, res) => {
  const moment = await momentService.hideMoment(
    req.params.id,
    req.userId,
    req.userRole,
  );

  res.status(HTTP_STATUS.OK).json({
    message: RESPONSE_MESSAGES.UPDATED,
    moment,
  });
});

export const deleteMoment = asyncHandler(async (req, res) => {
  await momentService.deleteMoment(req.params.id, req.userId, req.userRole);

  res.status(HTTP_STATUS.OK).json({
    message: RESPONSE_MESSAGES.DELETED,
  });
});
