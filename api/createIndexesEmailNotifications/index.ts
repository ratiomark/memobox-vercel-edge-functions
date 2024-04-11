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

async function createIndexEmailNotifications() {
	const db = client.db(dbName)
	const collection = db.collection<EmailTrainingNotificationItem>(emailCollectionName)
	await collection.createIndex({ notificationId: 1 }, { unique: true })
	await collection.createIndex({ notificationTime: 1 })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
	try {
		const apiKey = req.headers['x-api-key']
		if (apiKey !== API_SECRET_KEY) {
			return res.status(401).json({ message: 'Invalid API Key' })
		}
		if (req.method === 'POST') {
			await client.connect()
			const dbResponse = await createIndexEmailNotifications()
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
