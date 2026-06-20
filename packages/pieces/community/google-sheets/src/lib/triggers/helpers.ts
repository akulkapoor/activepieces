import {
	AuthenticationType,
	HttpMethod,
	httpClient,
} from '@activepieces/pieces-common';
import { isNil } from '@activepieces/shared';
import crypto from 'crypto';
import dayjs from 'dayjs';
import { nanoid } from 'nanoid';
import { columnToLabel, getAccessToken, GoogleSheetsAuthValue } from '../common/common';

export async function getWorkSheetName(
	auth: GoogleSheetsAuthValue,
	spreadSheetId: string,
	sheetId: number,
) {
	const response = await httpClient.sendRequest<{
		sheets?: { properties?: { title?: string | null; sheetId?: number | null } }[];
	}>({
		method: HttpMethod.GET,
		url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadSheetId}`,
		authentication: {
			type: AuthenticationType.BEARER_TOKEN,
			token: await getAccessToken(auth),
		},
	});

	const sheetName = response.body.sheets?.find((f) => f.properties?.sheetId == sheetId)?.properties
		?.title;

	if (!sheetName) {
		throw Error(`Sheet with ID ${sheetId} not found in spreadsheet ${spreadSheetId}`);
	}

	return sheetName;
}

export async function getWorkSheetGridSize(
	auth: GoogleSheetsAuthValue,
	spreadSheetId: string,
	sheetId: number,
) {
	const response = await httpClient.sendRequest<{
		sheets?: {
			properties?: {
				sheetId?: number | null;
				title?: string | null;
				sheetType?: string | null;
				gridProperties?: {
					rowCount?: number | null;
					columnCount?: number | null;
				};
			};
		}[];
	}>({
		method: HttpMethod.GET,
		url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadSheetId}`,
		queryParams: {
			includeGridData: 'true',
			fields: 'sheets.properties(sheetId,title,sheetType,gridProperties)',
		},
		authentication: {
			type: AuthenticationType.BEARER_TOKEN,
			token: await getAccessToken(auth),
		},
	});

	const sheetRange = response.body.sheets?.find((f) => f.properties?.sheetId == sheetId)?.properties
		?.gridProperties;

	if (!sheetRange) {
		throw Error(`Unable to get grid size for sheet ${sheetId} in spreadsheet ${spreadSheetId}`);
	}

	return sheetRange;
}

export async function getWorkSheetValues(
	auth: GoogleSheetsAuthValue,
	spreadsheetId: string,
	range?: string,
) {
	const response = await httpClient.sendRequest<{ values?: string[][] }>({
		method: HttpMethod.GET,
		url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range ?? '')}`,
		authentication: {
			type: AuthenticationType.BEARER_TOKEN,
			token: await getAccessToken(auth),
		},
	});

	return response.body.values ?? [];
}

export async function createFileNotification(
	auth: GoogleSheetsAuthValue,
	fileId: string,
	url: string,
	includeTeamDrives?: boolean,
) {
	const channelId = nanoid();
	const response = await httpClient.sendRequest<WebhookInformation>({
		method: HttpMethod.POST,
		url: `https://www.googleapis.com/drive/v3/files/${fileId}/watch`,
		queryParams: includeTeamDrives ? { supportsAllDrives: 'true' } : undefined,
		body: {
			id: channelId,
			expiration: (dayjs().add(6, 'day').unix() * 1000).toString(),
			type: 'web_hook',
			address: url,
		},
		authentication: {
			type: AuthenticationType.BEARER_TOKEN,
			token: await getAccessToken(auth),
		},
	});

	return { data: response.body };
}

export async function deleteFileNotification(
	auth: GoogleSheetsAuthValue,
	channelId: string,
	resourceId: string,
) {
	await httpClient.sendRequest({
		method: HttpMethod.POST,
		url: 'https://www.googleapis.com/drive/v3/channels/stop',
		body: {
			id: channelId,
			resourceId,
		},
		authentication: {
			type: AuthenticationType.BEARER_TOKEN,
			token: await getAccessToken(auth),
		},
	});
}

export function isSyncMessage(headers: Record<string, string>) {
	return headers['x-goog-resource-state'] === 'sync';
}

export function isChangeContentMessage(headers: Record<string, string>) {
	return (
		headers['x-goog-resource-state'] === 'update' &&
		['content', 'properties', 'content,properties'].includes(headers['x-goog-changed'])
	);
}

export function hashObject(obj: Record<string, unknown>): string {
	const hash = crypto.createHash('sha256');
	hash.update(JSON.stringify(obj));
	return hash.digest('hex');
}

export function mapRowsToColumnLabels(rowValues: unknown[][], oldRowCount: number, headerCount: number) {
	const result = [];
	for (let i = 0; i < rowValues.length; i++) {
		const values: Record<string, string> = {};
		for (let j = 0; j < Math.max(headerCount, rowValues[i].length); j++) {
			const columnLabel = columnToLabel(j);
			const cell = rowValues[i][j];
			if (isNil(cell)) {
				values[columnLabel] = '';
			} else {
				values[columnLabel] = String(cell);
			}
		}
		result.push({
			row: oldRowCount + i + 1,
			values,
		});
	}
	return result;
}

export type WebhookInformation = {
	kind?: string | null;
	id?: string | null;
	resourceId?: string | null;
	resourceUri?: string | null;
	expiration?: string | null;
};
