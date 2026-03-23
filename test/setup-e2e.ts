import { z } from "zod"

const envSchema = z.object({
  E2E_MQTT_HOST: z.string(),
})

envSchema.parse(process.env)
