// import type { VercelRequest, VercelResponse } from '@vercel/node'

// export default function handler(req: VercelRequest, res: VercelResponse): void {
// 	const message = process.env.WELCOME_MESSAGE || 'Hello from Training Push'
// 	res.status(200).json({ message })
// }
import { VercelRequest, VercelResponse } from '@vercel/node'
import { MongoClient } from 'mongodb'
type language = 'en' | 'ru'
const languages: language[] = ['en', 'ru']
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

// Функция для получения уведомлений по языку пользователя и времени
async function getNotificationsByLangAndTime(language: string) {
	const db = client.db('memobox')
	const collection = db.collection<TrainingNotificationItem>('email_notifications')
	
	const twoMinutesLater = new Date(new Date().getTime() + 2 * 60 * 1000)
	const notifications = await collection
		.find({
			user_language: language,
			notificationTime: { $lt: twoMinutesLater },
		})
		.toArray()
	console.log('notifications', notifications)
	return notifications
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
	try {
		await client.connect()
		const apiKey = req.headers['x-api-key']
		console.log('req.body', req.body)
		if (apiKey !== API_SECRET_KEY) {
			return res.status(401).json({ message: 'Invalid API Key' })
		}
		// const apiKey = await getSendGridApiKey()
		// sgMail.setApiKey(apiKey)
		if (req.method === 'GET') {
			const notificationItemsPromises = languages.map((lang) => getNotificationsByLangAndTime(lang))
			const allNotificationItems = (await Promise.all(notificationItemsPromises)) as TrainingNotificationItem[][]
			// Получение уведомлений для заданного языка
			// const language = req.query.lang as string
			// const notifications = await getNotificationsByLangAndTime(language)
			res.status(200).json(allNotificationItems)
		} else {
			res.status(405).send('Method not allowed')
		}
	} catch (error) {
		res.status(500).send('Server error')
	} finally {
		await client.close()
	}
}
