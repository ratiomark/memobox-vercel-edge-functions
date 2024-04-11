import { VercelRequest, VercelResponse } from '@vercel/node'
import { MongoClient } from 'mongodb'
import { EmailTrainingNotificationItem } from '../../common/types/trainings-types'
import { dbName, emailCollectionName } from '../../common/const'

const uri = process.env.MONGO_URL
const API_SECRET_KEY = process.env.API_SECRET_KEY
if (!uri) {
	throw new Error('Mongo URL is not provided')
}
const client = new MongoClient(uri)

// Функция для добавления или обновления уведомлений
async function upsertNotifications(items: EmailTrainingNotificationItem[]) {
	const db = client.db(dbName)
	const collection = db.collection<EmailTrainingNotificationItem>(emailCollectionName)

	const operations = items.map((item) => ({
		updateOne: {
			filter: { notificationId: item.notificationId },
			update: { $set: { ...item, notificationTime: new Date(item.notificationTime) } },
			upsert: true,
		},
	}))

	const result = await collection.bulkWrite(operations)
	return result
}
// async function upsertNotifications(items: EmailTrainingNotificationItem[]) {
// 	const db = client.db('memobox')
// 	const collection = db.collection<EmailTrainingNotificationItem>(emailCollectionName)
// 	const itemsWithDate = items.map((item) => ({ ...item, notificationTime: new Date(item.notificationTime) }))
// 	const upsertPromises = itemsWithDate.map((item) => collection.updateOne({ notificationId: item.notificationId }, { $set: item }, { upsert: true }))

// 	return await Promise.all(upsertPromises)
// }

export default async function handler(req: VercelRequest, res: VercelResponse) {
	try {
		const apiKey = req.headers['x-api-key']
		console.log('req.body', req.body)
		if (apiKey !== API_SECRET_KEY) {
			return res.status(401).json({ message: 'Invalid API Key' })
		}

		if (req.method === 'POST') {
			// Добавление или обновление уведомлений
			if (!req.body) {
				return res.status(200).json({ message: 'Request body is empty' })
			}
			await client.connect()
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
