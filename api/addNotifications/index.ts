// import type { VercelRequest, VercelResponse } from '@vercel/node'

// export default function handler(req: VercelRequest, res: VercelResponse): void {
// 	const message = process.env.WELCOME_MESSAGE || 'Hello from Training Push'
// 	res.status(200).json({ message })
// }
import { VercelRequest, VercelResponse } from '@vercel/node'
import { MongoClient } from 'mongodb'

const uri = process.env.MONGO_URL
const API_SECRET_KEY = process.env.API_SECRET_KEY
if (!uri) {
	throw new Error('Mongo URL is not provided')
}
const client = new MongoClient(uri)
interface TrainingNotificationItem {
	notificationId: string
	notificationTime: Date
	email: string
	user_language: string
	notificationType: string
	name: string
}

// Функция для добавления или обновления уведомлений
async function upsertNotifications(items: TrainingNotificationItem[]) {
	const db = client.db('memobox')
	const collection = db.collection<TrainingNotificationItem>('email_notifications')
	collection.createIndex({ notificationTime: 1 })
	const itemsWithDate = items.map((item) => ({ ...item, notificationTime: new Date(item.notificationTime) }))
	const upsertPromises = itemsWithDate.map((item) => collection.updateOne({ notificationId: item.notificationId }, { $set: item }, { upsert: true }))

	return await Promise.all(upsertPromises)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
	try {
		const apiKey = req.headers['x-api-key']
		console.log('req.body', req.body)
		if (apiKey !== API_SECRET_KEY) {
			return res.status(401).json({ message: 'Invalid API Key' })
		}

		await client.connect()
		if (req.method === 'POST') {
			// Добавление или обновление уведомлений
			const dbResponse = await upsertNotifications(req.body)
			console.log('Success', dbResponse)
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
