const app = require("./src/app");
const port = 5000;

app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
});
