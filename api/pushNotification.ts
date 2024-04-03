// import type { VercelRequest, VercelResponse } from '@vercel/node'

// export default function handler(req: VercelRequest, res: VercelResponse): void {
// 	const message = process.env.WELCOME_MESSAGE || 'Hello from Training Push'
// 	res.status(200).json({ message })
// }
import { VercelRequest, VercelResponse } from '@vercel/node'
import { MongoClient } from 'mongodb'

const uri = process.env.MONGO_URL
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
	const db = client.db('yourDatabaseName')
	const collection = db.collection<TrainingNotificationItem>('notifications')

	const upsertPromises = items.map((item) => collection.updateOne({ notificationId: item.notificationId }, { $set: item }, { upsert: true }))

	await Promise.all(upsertPromises)
}

// Функция для получения уведомлений по языку пользователя и времени
async function getNotificationsByLangAndTime(language: string) {
	const db = client.db('yourDatabaseName')
	const collection = db.collection<TrainingNotificationItem>('notifications')

	const twoMinutesLater = new Date(new Date().getTime() + 2 * 60 * 1000)
	const notifications = await collection
		.find({
			user_language: language,
			notificationTime: { $lt: twoMinutesLater },
		})
		.toArray()

	return notifications
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
	try {
		await client.connect()

		if (req.method === 'POST') {
			// Добавление или обновление уведомлений
			await upsertNotifications(req.body)
			res.status(200).send('Notifications upserted successfully')
		} else if (req.method === 'GET') {
			// Получение уведомлений для заданного языка
			const language = req.query.lang as string
			const notifications = await getNotificationsByLangAndTime(language)
			res.status(200).json(notifications)
		} else {
			res.status(405).send('Method not allowed')
		}
	} catch (error) {
		res.status(500).send('Server error')
	} finally {
		await client.close()
	}
}
