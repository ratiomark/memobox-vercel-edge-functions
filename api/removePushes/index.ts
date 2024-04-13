import { VercelRequest, VercelResponse } from '@vercel/node'
import { MongoClient } from 'mongodb'
import { dbName, pushCollectionName } from '../../common/const'
import { PushTrainingNotificationItem } from '../../common/types/trainings-types'

const uri = process.env.MONGO_URL
const API_SECRET_KEY = process.env.API_SECRET_KEY
if (!uri) {
	throw new Error('Mongo URL is not provided')
}
const client = new MongoClient(uri)

async function deleteNotifications(notificationIds: string[]) {
	const db = client.db(dbName)
	const collection = db.collection<PushTrainingNotificationItem>(pushCollectionName)

	const result = await collection.deleteMany({
		notificationId: { $in: notificationIds },
	})
	return result
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
	try {
		const apiKey = req.headers['x-api-key']
		console.log('req.body', req.body)
		if (apiKey !== API_SECRET_KEY) {
			return res.status(401).json({ message: 'Invalid API Key' })
		}

		if (req.method === 'POST') {
			if (!req.body || !req.body.notificationIds) {
				return res.status(400).json({ message: 'Request body is empty or missing notificationIds' })
			}
			await client.connect()
			const dbResponse = await deleteNotifications(req.body.notificationIds)
			console.log('Delete success', dbResponse)
			res.status(200).send(dbResponse)
		} else {
			res.status(405).send('Method not allowed')
		}
	} catch (error) {
		console.error('error', error)
		res.status(500).send('Server error')
	} finally {
		await client.close()
	}
}
