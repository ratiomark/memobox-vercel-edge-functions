// import type { VercelRequest, VercelResponse } from '@vercel/node'

// export default function handler(req: VercelRequest, res: VercelResponse): void {
// 	const message = process.env.WELCOME_MESSAGE || 'Hello from Training Push'
// 	res.status(200).json({ message })
// }
import { VercelRequest, VercelResponse } from '@vercel/node'
import { MongoClient } from 'mongodb'
import { dbName, pushCollectionName, languages } from '../../common/const'
import { PushTrainingNotificationItem, language } from '../../common/types/trainings-types'

const uri = process.env.MONGO_URL
const API_SECRET_KEY = process.env.API_SECRET_KEY
if (!uri) {
	throw new Error('Mongo URL is not provided')
}
const client = new MongoClient(uri)

type PushRequest = {
	[K in language]: PushTrainingNotificationItem[]
}

// Функция для получения уведомлений по языку пользователя и времени
async function getNotificationsByLangAndTime(language: string) {
	const db = client.db(dbName)
	const collection = db.collection<PushTrainingNotificationItem>(pushCollectionName)

	const twoMinutesLater = new Date(new Date().getTime() + 2 * 60 * 1000)
	const notifications = await collection
		.find({
			user_language: language,
			// notificationTime: { $lt: twoMinutesLater },
		})
		.toArray()

	console.log('notifications', notifications)
	return notifications
}

// функция которая автоматически увеличивает время следующего уведомления на 4 часа.
// использую на случай каких либо ошибок, чтобы не скапливались уведомления
async function correctNotificationsTime(notifications: PushTrainingNotificationItem[]) {
	if (notifications.length === 0) {
		return
	}
	const db = client.db(dbName)
	const collection = db.collection<PushTrainingNotificationItem>(pushCollectionName)

	const afterTwoHours = new Date(new Date().getTime() + 2 * 60 * 60 * 1000)
	const operations = notifications.map((notification) => ({
		updateOne: {
			filter: { notificationId: notification.notificationId },
			update: {
				$set: { ...notification, notificationTime: afterTwoHours },
			},
		},
	}))
	return await collection.bulkWrite(operations)
}

async function getBackendUrl() {
	const backendUrl = process.env.BACKEND_URL
	if (!backendUrl) {
		return 'https://memobox.tech/'
	}
	return backendUrl
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
	try {
		const apiKey = req.headers['x-api-key']
		// console.log('req.body', req.body)
		if (apiKey !== API_SECRET_KEY) {
			return res.status(422).json({ message: 'Invalid API Key' })
		}
		if (req.method === 'POST') {
			await client.connect()
			const notificationItemsPromises = languages.map((lang) => getNotificationsByLangAndTime(lang))
			const allNotificationItems = (await Promise.all(notificationItemsPromises)) as PushTrainingNotificationItem[][]

			await correctNotificationsTime(allNotificationItems.flat())

			const pushRequest: PushRequest = {
				en: [],
				ru: [],
			}

			languages.forEach((lang, index) => {
				pushRequest[lang] = allNotificationItems[index]
			})

			const backendUrl = await getBackendUrl()
			const prefix = 'api/v1/'
			const endpoint = 'notifications/sendAllTrainingPushes'

			console.log('backend full url:  ', backendUrl + prefix + endpoint)

			const response = await fetch(backendUrl + prefix + endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey! },
				body: JSON.stringify(pushRequest),
			})

			if (!response.ok) {
				// Обработка ошибок HTTP, если статус ответа не успешен
				throw new Error(`HTTP error! status: ${response.status}`)
			} else {
				const responseData = await response.json() // предполагается, что сервер возвращает JSON
				console.log('Response from backend:', responseData)
			}

			res.status(200).json(pushRequest)
		} else {
			res.status(405).send('Method not allowed')
		}
	} catch (error) {
		res.status(500).send('Server error')
	} finally {
		await client.close()
	}
}
