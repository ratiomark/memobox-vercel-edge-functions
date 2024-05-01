import sgMail, { MailDataRequired } from '@sendgrid/mail'
import { VercelRequest, VercelResponse } from '@vercel/node'
import { language } from '../../common/types/trainings-types'

interface EmailParams {
	to: string
	emailType: string
	language: language
	data?: any
}

interface FromObject {
	email: string
	name: string
}

interface SendGridData extends FromObject {
	templateId: string
	subject: string
}

async function getBackendUrl() {
	const backendUrl = process.env.BACKEND_URL
	if (!backendUrl) {
		return 'https://memobox.tech/'
	}
	return backendUrl
}

// '{"name": "Welcome to memobox!", "email": "just@@memobox.tech", "templateId":" d-dd2231c4f21347aa9be47af870de084c", "subject": "Welcome to memobox!"}'
// async function getSendGridDataByLangAndType(language: string, emailType: string) {
// 	const command = new GetParameterCommand({
// 		Name: `/SendGridData/${language}/${emailType}`,
// 		WithDecryption: true,
// 	})
// 	const response = await client.send(command)
// 	if (!response.Parameter?.Value) {
// 		throw new Error('SendGrid template id not found')
// 	}
// 	return JSON.parse(response.Parameter.Value) as SendGridData
// }
async function getSendGridDataByLangAndType(language: language, emailType: string) {
	let data = process.env[`SEND_GRID_DATA_${language.toUpperCase()}_${emailType}`]
	if (!data) {
		data = process.env[`SEND_GRID_DATA_EN_${emailType}`]
	}
	return JSON.parse(data!) as SendGridData
}
// {"name": "Welcome to memobox!", "email": "just@memobox.tech", "templateId":" d-dd2231c4f21347aa9be47af870de084c", "subject": "registration"}
// async function getSendGridData(language: string, emailType: string): SendGridData {
// 	const apiKey = await getSendGridApiKey()
// 	const templateId = await getSendGridTemplateId(language, emailType)
// 	const from = {
// 		email: '
// }
// export const handler = async (request: { body: EmailParams }) => {
export default async function handler(req: VercelRequest, res: VercelResponse) {
	const start = performance.now()
	  try {
			console.log('Received request:', req.body)

			if (req.method !== 'POST') {
				console.error('Invalid method')
				return res.status(405).send('Method not allowed')
			}

			if (!req.body) {
				console.error('No body found in request')
				return res.status(400).send('No body found in request')
			}

			if (!req.body.language) {
				req.body.language = 'en' // Default language
			}

			if (!req.body.to) {
				console.error('No recipient found in body')
				return res.status(400).send('No recipient found in body - field with name "to" is undefined')
			}

			if (!req.body.emailType) {
				console.error('No emailType found in body')
				return res.status(400).send('No emailType found in body')
			}

			const sendGridApiKey = process.env.SEND_GRID_API_KEY

			if (!sendGridApiKey) {
				throw new Error('SendGrid API key is not provided. End edge function execution.')
			}
			sgMail.setApiKey(sendGridApiKey)

			let sendGridData = await getSendGridDataByLangAndType(req.body.language, req.body.emailType)
			if (!sendGridData) {
				console.error('No sendGridData found')
				sendGridData = await getSendGridDataByLangAndType('en', req.body.emailType)
				if (!sendGridData) {
					console.error('No sendGridData found')
					return res.status(404).send('No sendGridData found')
				}
			}
			// const start = performance.now()

			const { name, email, templateId, subject } = sendGridData

			console.log('dataTest:', sendGridData)

			const { to } = req.body

			const msg: MailDataRequired = {
				from: {
					email,
					name: 'Memobox',
				},
				personalizations: [
					{
						to: [{ email: to }],
						dynamicTemplateData: {
							...req.body.data,
							subject,
						},
					},
				],
				templateId,
			}
			let end = performance.now()
			console.log(`sendEmail time before SG response: ${end - start} ms`)
			const [response] = await sgMail.send(msg)
			// const responseData = JSON.stringify(response, null, 3)
			// const responseBodyData = JSON.stringify(response.body, null, 3)
			end = performance.now()
			console.log(`sendEmail time after SG response: ${end - start} ms`)
			// console.log(`responseData  `, responseData)
			// console.log(`responseBodyData  `, responseBodyData)
			// return { statusCode: 200, body: response }
			res.status(200).send(response)
		} catch (error) {
			console.error(error)
			const end = performance.now()
			console.log(`sendEmail time after error: ${end - start} ms`)
			res.status(500).send('Failed to send email')
			// return { statusCode: 500, body: 'Failed to send email' }
		}
}
