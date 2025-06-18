import { sleep } from "../utils/sleep"

export function withRetry(maxRetries = 3, delayMs = 1000, shouldRetry?: (error: any) => boolean) {
	return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
		const originalMethod = descriptor.value

		descriptor.value = async function (...args: any[]) {
			for (let i = 0; i < maxRetries; i++) {
				try {
					return await originalMethod.apply(this, args)
				} catch (error: any) {
					if (shouldRetry && !shouldRetry(error)) {
						throw error
					}
					if (i < maxRetries - 1) {
						await sleep(delayMs * Math.pow(2, i)) // Exponential backoff
					} else {
						throw error
					}
				}
			}
		}

		return descriptor
	}
}
