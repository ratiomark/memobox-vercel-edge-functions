export interface EmailTrainingNotificationItem {
	notificationId: string
	notificationTime: Date
	email: string
	user_language: string
	notificationType: string
	name: string
}

export interface PushTrainingNotificationItem {
	notificationId: string
	notificationTime: Date
	user_language: string
	// name: string
}
export type language = 'en' | 'ru'
