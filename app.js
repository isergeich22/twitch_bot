require('dotenv').config() // Загружаем переменные из файла .env
const axios = require('axios') // Подключаем библиотеку для HTTP-запросов
const formData = require('form-data') // Подключаем библиотеку для отправки файлов
const fs = require('fs') // Подключаем модуль для работы с файловой системой
const winston = require('winston') // Подключаем библиотеку для логирования

// Константы API Twitch и Telegram
const TWITCH_API_URL = 'https://api.twitch.tv/helix/streams' // URL для получения данных о трансляциях Twitch
const TOKEN_URL = 'https://id.twitch.tv/oauth2/token' // URL для получения токена доступа Twitch
const TELEGRAM_API_URL = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/`// URL Telegram Bot API с токеном из переменных оркужения

// Переменные для хранения токена доступа, ID последней трансляции и имени файла последней трансляции
let twitchAccessToken = null // Twitch Access Token
let lastStreamFile = 'lastStreamId.txt' // Имя файла, где хранится ID последней трансляции
let lastStreamId = null // ID последней трансляции

// Настройка логгера с использование библиотеки Winston
const logger = winston.createLogger(
    {
        level: 'info', // Уровень логгирования (информационные сообщения)
        format: winston.format.combine(
            winston.format.timestamp({
                format: () => new Intl.DateTimeFormat('ru-RU', {
                    timeZone: 'Europe/Moscow',
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                }).format(new Date())
            }), // Добавляем временную метку к каждому сообщению
            winston.format.printf(({ timestamp, level, message }) => `${timestamp} [${level}: ${message}]`)
        ),
        transports: [
            new winston.transports.Console(), // Логгирование в консоль
            new winston.transports.File({ filename: 'bot.log' }) // Логгирование в .log файл
        ]
    },
    {
        level: 'error', // Дополнительный уровень логгирования (сообщения об ошибках)
        format: winston.format.combine(
            winston.format.timestamp({
                format: () => new Intl.DateTimeFormat('ru-RU', {
                    timeZone: 'Europe/Moscow',
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                }).format(new Date())
            }),
            winston.format.printf(({ timestamp, level, message }) => `${timestamp} [${level}: ${message}]`)
        ),
        transports: [
            new winston.transports.Console(),
            new winston.transports.File({ filename: 'bot.log' })
        ]
    }
)

logger.info('Бот запущен') // Информируем о запуске бота через логгер

// Асинхронная функция для получения Twitch Access Token
async function getTwitchAccessToken() {

    try {

        // Отправляем POST - запрос на получение Twitch Access Token
        const response = await axios.post(TOKEN_URL, null, {
            params: {
                client_id: process.env.TWITCH_CLIENT_ID, // ID клиента Twitch из переменных окружения
                client_secret: process.env.TWITCH_CLIENT_SECRET, // Секретный ключ клиента Twitch из переменных окружения
                grant_type: 'client_credentials' // Тип запроса для получения Twitch Access Token
            }
        })

        // Сохраняем полученный токен в глобальной переменной
        twitchAccessToken = response.data.access_token

        // Информируем об успешном получении токена
        logger.info('Новый Twitch Access Token получен')

    } catch(error) {

        // Логгируем ошибку при неудачной попытке получения Twitch Access Token
        logger.error('Ошибка при получении Twitch Access Token:', error.response ? error.response.data : error)

    }

}

// Функция для сохранения ID последней запущенной трансляции в файл
function saveLastStreamId(streamId) {
    fs.writeFileSync(lastStreamFile, lastStreamId, 'utf8')
}

// Функция для загрузки ID последней запущенной трансляции из файла
function loadLastStreamId() {
    if(fs.existsSync(lastStreamFile)) {
        // Если файл существует, читаем его содержимое и удаляем лишние пробелы/переводы строк
        return fs.readFileSync(lastStreamFile, 'utf8').trim()
    }
    return null // Если файл отсутствует, возвращаем null как признак отсутствия данных
}

// Асинхронная функция для проверки наличия активной трансляции
async function checkStream() {

    // Если Twitch Access token отсутствует, запрашиваем его с помощью заданной функции
    if(!twitchAccessToken) await getTwitchAccessToken()

    try {

        // Отправляем GET - запрос на получение информации об активной трансляции
        const response = await axios.get(TWITCH_API_URL, {
            params: {
                user_login: process.env.TWITCH_USERNAME // Имя пользователя Twitch из переменных оркужения
            },
            headers: {
                'Client-ID': process.env.TWITCH_CLIENT_ID, // ID пользователя Twitch из переменных окружения
                'Authorization': `Bearer ${twitchAccessToken}` // Токен доступа из глобальной переменной
            }
        })

        // Константа с ответом GET - запроса
        const streams = response.data.data

        // Если активная трансляция отсутсвует, сообщаем об этом
        if(!streams || streams.length === 0) {

            logger.info('Стрим не найден. Ожидание стрима...') // Информируем об отсутствии активной трансляции
            lastStreamId = null // Присваиваем пустое значение глобальной переменной для ID трансляции
            return // Завершаем выполнение асинхронной функции

        }

        // Константа с информацией об активной трансляции
        const stream = streams[0]

        // Константа с временной меткой начала трансляции
        const beginString = new Date(stream.started_at).toLocaleString('ru-RU', {
            timeZone: "Europe/Moscow"
        })

        // Деструктурированное преобразование строки с временной меткой в массив
        let [ date, time ] = beginString.split(',')

        // Преобразование строки с датой в массив
        date = date.split('.')

        // Формирование строки с датой в требуемом формате
        date = `${date[0]}/${date[1]}/${date[2]}`

        // Получение строки времени в требуемом формате
        time = time.slice(0, 6)

        // Константа с информацией о начале трансляции
        const createdAt = `${time} ${date}`        

        // Если активная трансляция присутствует, переходим к проверке последнего ID трансляции в файле
        if(stream) {

            lastStreamId = loadLastStreamId(lastStreamFile) // Присваиваем глобальной переменной значение из файла с ID

            // Если ID не совпадают, запускаем формирование уведомления о появившейся трансляции
            if(stream.id !== lastStreamId) {

                logger.info('Новый стрим найден, отправляем уведомление...') // Информируем о появлении активной трансляции
                lastStreamId = stream.id // Актуализируем значение ID активной трансляции в глобальной переменной
                saveLastStreamId(lastStreamId) // Вызываем функцию сохранения нового ID активной трансляции в файл

                // Константа с необходимой информацией об активной трансляции
                const streamInfo = {
                    username: process.env.TWITCH_USERNAME, // Имя пользователя Twitch из переменных окружения
                    title: stream.title, // Название активной трансляции
                    category: stream.game_name, // Категория (игра) активной трансляции
                    startTime: createdAt, // Временная метка начала активной трансляции
                    image: stream.thumbnail_url // Изображение активной трансляции
                        .replace('{width}', '1920') // Указание корректной ширины изображения
                        .replace('{height}', '1080'), // Указание корректной высоты изображения
                    viewers: stream.viewer_count // Число зрителей активной трансляции
                }
                
                await sendTelegramMessage(streamInfo) // Вызываем асинхронную функцию отправки уведомления в Telegram чат

            } else {

                // Информируем об уже отправленном уведомлении
                logger.info('Оповещение уже было отправлено')

            }
        }

    } catch(error) {

        // Если попытка не удалась и статус ответа 401
        if(error.response && error.response.status === 401) {

            logger.info('Токен устарел, запрашиваем новый...') // Информируем об устаревании текущего Twitch Access Token
            await getTwitchAccessToken() // Вызываем функцию получение актуального Twitch Access Token

        } else {

            logger.error('Ошибка при проверке стрима:', error.response ? error.response.data : error) // Логгируем ошибку при проверке наличия актуальной трансляции

        }

    }

}

// Асинхронная функция отправки уведомления в Telegram - чат
async function sendTelegramMessage(streamInfo) {

    // Константа с HTML текстом уведомления
    const messages = `
    <b>[Twitch]</b> ${streamInfo.username} в сети!
    <b>Название:</b> ${streamInfo.title}
    <b>Категория:</b> ${streamInfo.category}
    <b>Начало:</b> ${streamInfo.startTime}
    <b>Зрителей:</b> ${streamInfo.viewers}
    `

    try {

        const form = new formData()

        form.append('chat_id', process.env.TELEGRAM_CHAT_ID)
        form.append('photo', fs.createReadStream('./BeginStream.png'))
        form.append('caption', messages)
        form.append('parse_mode', 'HTML')
        form.append('reply_markup', JSON.stringify({
            inline_keyboard: [[
                    { text: "Смотреть стрим!", url: `https://www.twitch.tv/${streamInfo.username}` }                    
                ]]
        }))

        // Отправляем POST - запрос для отправки уведомления в Telegram - чат
        const response = await axios.post(`${TELEGRAM_API_URL}sendPhoto`,
            form,
            {
                headers: form.getHeaders()
            }
        )

        // Константа для хранения ID отправленного уведомления
        const messageId = response.data.result.message_id

        console.log(messageId)

        // Установка таймера на удаление отправленного уведомления
        setTimeout(async () => {

            try {
                
                // Отправляем POST - запрос на удаление уведомления
                await axios.post(`${TELEGRAM_API_URL}deleteMessage`, {

                    chat_id: process.env.TELEGRAM_CHAT_ID, // Название чата из переменных окружения
                    message_id: messageId // ID отправленного уведомления

                })

                logger.info('Сообщение удалено') // Информируем об успешном удалении уведомления

            } catch(error) {

                console.log(error)
                logger.error('Ошибка удаления сообщения:', error.response ? error.response.data : error) // Логгируем ошибку при попытке удаления уведомления

            }

        }, 14400000) // Устанавливаем таймер на 4 часов (средняя продолжительность трансляции)

        logger.info('Оповещение отправлено!') // Информируем об успешной отправке уведомления

    } catch(error) {

        console.log(error.response.data)
        logger.error(`Ошибка отправки в Telegram: ${error.response.data.error_code} - ${error.response.data.description}`, error.response ? error.response.data : error) // Логгируем ошибку при попытке отправки уведомления

    }
    
}

setInterval(checkStream, 2 * 60 * 1000) // Устанавливаем интервал вызова функции проверки наличия активной трансляции