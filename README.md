# CRUD-API
npm run start:dev

получить список всех пользователей
http://localhost:4000/api/users

Команды для cmd


Коммандная строка
1. POST — создать пользователя

curl -X POST http://localhost:4000/api/users ^
  -H "Content-Type: application/json" ^
  -d "{\"username\": \"Ivan\", \"age\": 28, \"hobbies\": [\"airsoft\", \"fishing\"]}"

2. GET — получить всех пользователей

curl http://localhost:4000/api/users

3. GET — получить пользователя по id

curl http://localhost:4000/api/users/8b7c1ef9-22f9-4c2d-9f6a-8dbd2c3a3e70

4. PUT — обновить пользователя

curl -X PUT http://localhost:4000/api/users/8b7c1ef9-22f9-4c2d-9f6a-8dbd2c3a3e70 ^
  -H "Content-Type: application/json" ^
  -d "{\"username\": \"Ivan Petrov\", \"age\": 29, \"hobbies\": [\"airsoft\", \"reading\"]}"

5. DELETE — удалить пользователя

curl -X DELETE http://localhost:4000/api/users/8b7c1ef9-22f9-4c2d-9f6a-8dbd2c3a3e70

6. GET — проверить, что удалён

curl http://localhost:4000/api/users/8b7c1ef9-22f9-4c2d-9f6a-8dbd2c3a3e70







