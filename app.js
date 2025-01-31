require('dotenv').config()
const axios = require('axios')
const winston = require('winston')

const TWITCH_API_URL = 'https://api.twitch.tv/helix/streams'
const TOKEN_URL = 'https://id.twitch.tv/oauth2/token'
const TELEGRAM_API_URL = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`

let twitchAccessToken = null
let lastStreamId = null

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => `${timestamp} [${level}: ${message}]`)
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'bot.log' })
    ]
})

logger.info('Бот запущен')

async function getTwitchAccessToken() {

    try {

        const response = await axios.post(TOKEN_URL, null, {
            params: {
                client_id: process.env.TWITCH_CLIENT_ID,
                client_secret: process.env.TWITCH_CLIENT_SECRET,
                grant_type: 'client_credentials'
            }
        })

        twitchAccessToken = response.data.access_token
        console.log('Новый Twitch Access Token получен')

    } catch(error) {

        console.error('Ошибка при получении Twitch Access Token:', error.response ? error.response.data : error)

    }

}

async function checkStream() {

    if(!twitchAccessToken) await getTwitchAccessToken()

    try {

        const response = await axios.get(TWITCH_API_URL, {
            params: {
                user_login: process.env.TWITCH_USERNAME
            },
            headers: {
                'Client-ID': process.env.TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${twitchAccessToken}`
            }
        })

        const streams = response.data.data

        if(!streams || streams.length === 0) {

            console.log('Стрим не найден. Ожидание стрима...')
            lastStreamId = null
            return

        }

        const stream = streams[0]

        console.log(stream)

        const beginString = new Date(stream.started_at).toLocaleString('ru-RU', {
            timeZone: "Europe/Moscow"
        })

        console.log(beginString)

        let [ date, time ] = beginString.split(',')

        date = date.split('.')

        date = `${date[0]}/${date[1]}/${date[2]}`
        time = time.slice(0, 5)

        const createdAt = `${time} ${date}`        

        if(stream) {
            if(stream.id !== lastStreamId) {
                
                lastStreamId = stream.id
                const streamInfo = {
                    username: process.env.TWITCH_USERNAME,
                    title: stream.title,
                    category: stream.game_name,
                    startTime: createdAt,
                    image: stream.thumbnail_url
                        .replace('{width}', '1920')
                        .replace('{height}', '1080'),
                    viewers: stream.viewer_count
                }
                await sendTelegramMessage(streamInfo)

            }
        } else {
            
            lastStreamId = null

        }

    } catch(error) {

        if(error.response && error.response.status === 401) {

            console.log('Токен устарел, запрашиваем новый...')
            await getTwitchAccessToken()

        } else {

            console.error('Ошибка при проверке стрима:', error.response ? error.response.data : error)

        }

    }

}

async function sendTelegramMessage(streamInfo) {

    const messages = `
    <b>[Twitch]</b> ${streamInfo.username} в сети!

    <b>Название:</b> ${streamInfo.title}
    <b>Категория:</b> ${streamInfo.category}
    <b>Начало:</b> ${streamInfo.startTime}
    <b>Зрителей:</b> ${streamInfo.viewers}
    `

    const keyboard = {
        inline_keyboard: [[
            { text: "Смотреть стрим", url: `https://www.twitch.tv/${streamInfo.username}` }
        ]]
    }

    try {

        const response = await axios.post(TELEGRAM_API_URL, {

            chat_id: `@${process.env.TELEGRAM_CHAT_ID}`,
            photo: streamInfo.image,
            text: messages,
            parse_mode: "HTML",
            reply_markup: JSON.stringify(keyboard)

        })

        const messageId = response.data.result.message_id

        setTimeout(async () => {

            try {
                
                await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/deleteMessage`, {

                    chat_id: `@${process.env.TELEGRAM_CHAT_ID}`,
                    message_id: messageId

                })

                console.log('Сообщение удалено')

            } catch(error) {

                console.error('Ошибка удаления сообщения:', error.response ? error.response.data : error)

            }

        }, 300000)

        console.log('Оповещение отправлено!')

    } catch(error) {
        console.log('Ошибка отправки в Telegram:', error.response ? error.response.data : error)
    }
    
}

setInterval(checkStream, 2 * 60 * 1000)