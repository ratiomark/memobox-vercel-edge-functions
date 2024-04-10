// import type { VercelRequest, VercelResponse } from '@vercel/node'

// export default function handler(req: VercelRequest, res: VercelResponse): void {
// 	const message = process.env.WELCOME_MESSAGE || 'Hello from Training Push'
// 	res.status(200).json({ message })
// }
import { VercelRequest, VercelResponse } from '@vercel/node'
import { MongoClient, WithId } from 'mongodb'
import sgMail from '@sendgrid/mail'
type language = 'en' | 'ru'
const languages: language[] = ['en', 'ru']
const uri = process.env.MONGO_URL
const API_SECRET_KEY = process.env.API_SECRET_KEY
if (!uri) {
	throw new Error('Mongo URL is not provided')
}
const client = new MongoClient(uri)
const NotificationType = 'trainingNotification'

interface TrainingNotificationItem {
	notificationId: string
	notificationTime: Date
	email: string
	user_language: string
	notificationType: string
	name: string
}

interface FromObject {
	email: string
	name: string
}

interface SendGridData extends FromObject {
	templateId: string
	subject: string
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

// функция которая автоматически увеличивает время следующего уведомления на 4 часа.
// использую на случай каких либо ошибок, чтобы не скапливались уведомления
async function correctNotificationsTime(notifications: TrainingNotificationItem[]) {
	if (notifications.length === 0) {
		return
	}
	const db = client.db('memobox')
	const collection = db.collection<TrainingNotificationItem>('email_notifications')
	const operations = notifications.map((notification) => ({
		updateOne: {
			filter: { userId: notification.notificationId },
			update: {
				$set: { notificationTime: new Date(notification.notificationTime.getTime() + 4 * 60 * 60 * 1000) },
			},
		},
	}))
	await collection.bulkWrite(operations)
}

async function sendEmailsForLanguage(notificationItems: TrainingNotificationItem[], sendGridData: SendGridData, language: language) {
	if (notificationItems.length === 0) {
		console.log(`No notifications to send for language ${language}`)
		return { language, response: null, statusCode: 200, message: 'No notifications to send', notificationIds: [] }
	}

	const notificationIds = notificationItems.map((item) => item.notificationId)

	// Подготовка данных для отправки одного сообщения с персонализацией для каждого пользователя
	const personalizations = notificationItems.map((item) => ({
		to: [{ email: item.email, name: item.name }],
		dynamicTemplateData: {
			// Добавьте сюда данные, специфичные для пользователя, которые нужны для шаблона
			subject: sendGridData.subject,
			name: item.name,
			// Здесь можно расширить данные, если в шаблоне есть другие поля
		},
	}))

	const msg = {
		from: {
			email: sendGridData.email,
			name: sendGridData.name,
		},
		personalizations,
		templateId: sendGridData.templateId,
	}

	try {
		// const response = { message: 'Email sent' }
		const [response] = await sgMail.send(msg)

		console.log(`Bulk email sent with subject ${sendGridData.subject}`)
		return { language, success: true, response, notificationIds, statusCode: 200, message: 'SendGrid task completed' }
	} catch (error) {
		console.error(`Error sending bulk email with subject ${sendGridData.subject}:`, error)
		// Здесь лучше возвращать только сообщение об ошибке, а не весь объект error
		const errorMsg = error instanceof Error ? error.message : 'Unknown error'
		return { language, success: false, notificationIds, message: errorMsg }
	}
}

async function getSendGridDataByLangAndType(language: language, emailType = NotificationType) {
	let data = process.env[`SEND_GRID_DATA_${language.toUpperCase()}_${emailType}`]
	if (!data) {
		data = process.env[`SEND_GRID_DATA_EN_${emailType}`]
	}
	return JSON.parse(data!) as SendGridData
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
		await client.connect()
		const apiKey = req.headers['x-api-key']
		// console.log('req.body', req.body)
		if (apiKey !== API_SECRET_KEY) {
			return res.status(422).json({ message: 'Invalid API Key' })
		}
		const sendGridApiKey = process.env.SEND_GRID_API_KEY

		if (!sendGridApiKey) {
			throw new Error('SendGrid API key is not provided. End edge function execution.')
		}
		sgMail.setApiKey(sendGridApiKey)
		if (req.method === 'POST') {
			const notificationItemsPromises = languages.map((lang) => getNotificationsByLangAndTime(lang))
			const allNotificationItems = (await Promise.all(notificationItemsPromises)) as TrainingNotificationItem[][]

			// Запускаем параллельное получение sendGridData для всех языков
			// const sendGridData = languages.map((lang) => getSendGridDataByLangAndType(lang))
			const sendGridDataPromises = languages.map((lang) => getSendGridDataByLangAndType(lang))
			const allSendGridData = await Promise.all(sendGridDataPromises)

			const sendEmailPromises = languages.map((lang, index) => {
				const sendGridDataForLang = allSendGridData[index]
				const notificationItemsForLang = allNotificationItems[index]
				return sendEmailsForLanguage(notificationItemsForLang, sendGridDataForLang, lang)
			})

			const sendEmailResults = await Promise.all(sendEmailPromises)

			const backendUrl = await getBackendUrl()
			const prefix = 'api/v1/'
			const endpoint = 'notifications/recalculateNotifications'

			console.log('sendEmailResults:  ', sendEmailResults)
			console.log('backend full url:  ', backendUrl + prefix + endpoint)

			const response = await fetch(backendUrl + prefix + endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(sendEmailResults),
			})

			if (!response.ok) {
				// Обработка ошибок HTTP, если статус ответа не успешен
				throw new Error(`HTTP error! status: ${response.status}`)
			} else {
				const responseData = await response.json() // предполагается, что сервер возвращает JSON
				console.log('Response from backend:', responseData)
			}
			res.status(200).json(sendEmailResults)
			correctNotificationsTime(allNotificationItems.flat())
			// const allSendGridData = await Promise.all(sendGridDataPromises)
			// Получение уведомлений для заданного языка
			// const language = req.query.lang as string
			// const notifications = await getNotificationsByLangAndTime(language)
			// res.status(200).json(allNotificationItems)
		} else {
			res.status(405).send('Method not allowed')
		}
	} catch (error) {
		res.status(500).send('Server error')
	} finally {
		await client.close()
	}
}
