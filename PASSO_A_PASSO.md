# EstoquePlus — colocar no ar, passo a passo

Tempo: uns 30 minutos. Custo: zero (Firebase plano Spark + GitHub Pages).
Você **não precisa criar nenhum documento ou tabela à mão no Firebase**: o próprio sistema cria tudo quando é usado. No Firebase, você só liga o login e o banco.

---

## PARTE 1 — Firebase (login + banco de dados)

### 1. Criar o projeto
1. Acesse **https://console.firebase.google.com** e entre com uma conta Google da clínica.
2. Clique em **Criar um projeto** (ou "Adicionar projeto").
3. Nome: `estoqueplus` → **Continuar**.
4. Google Analytics: pode **desativar** → **Criar projeto** → **Continuar**.

### 2. Ligar o login por e-mail e senha
1. No menu da esquerda: **Criação** (Build) → **Authentication** → **Vamos começar**.
2. Aba **Método de login** → clique em **E-mail/senha** → ative a **primeira chave** (não precisa do "link por e-mail") → **Salvar**.

### 3. Criar o seu usuário master
1. Ainda em Authentication → aba **Usuários** → **Adicionar usuário**.
2. Coloque **o seu e-mail** e uma senha forte → **Adicionar usuário**.
   (Os outros usuários você cria depois, de dentro do sistema.)

### 4. Criar o banco de dados (Firestore)
1. Menu: **Criação** → **Firestore Database** → **Criar banco de dados**.
2. Local: **southamerica-east1 (São Paulo)** → **Avançar**. ⚠️ Não dá para mudar depois.
3. Escolha **Iniciar no modo de produção** → **Criar**.

### 5. Colar as regras de segurança
1. No Firestore, abra a aba **Regras**.
2. Apague tudo o que estiver lá.
3. Abra o arquivo **`firestore.rules`** (desta pasta) no Bloco de Notas, copie tudo e cole.
4. Na linha `function masterEmail() { return "seu-email@exemplo.com"; }` troque pelo **seu e-mail** (o mesmo do passo 3).
5. Clique em **Publicar**.

### 6. Pegar a "configuração" do app
1. Clique na **engrenagem ⚙️** (ao lado de "Visão geral do projeto") → **Configurações do projeto**.
2. Role até **Seus apps** → clique no ícone **`</>`** (Web).
3. Apelido: `estoqueplus` → **NÃO** marque Firebase Hosting → **Registrar app**.
4. Vai aparecer um bloco assim — **copie só a parte entre chaves**:
   ```js
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "estoqueplus-xxxx.firebaseapp.com",
     projectId: "estoqueplus-xxxx",
     storageBucket: "...",
     messagingSenderId: "...",
     appId: "..."
   };
   ```
5. → **Continuar no console**.

### 7. Preencher o arquivo de configuração
Abra **`firebase-config.js`** no Bloco de Notas e:
1. Substitua o bloco `firebaseConfig = { ... }` pelo que você copiou.
2. Em `MASTER_EMAIL`, coloque **o seu e-mail**.
3. Em `CLINICA`, coloque nome, endereço, telefone e WhatsApp da clínica.
4. Salve.

> Se preferir, me mande o bloco copiado no passo 6 que eu devolvo o arquivo pronto.

---

## PARTE 2 — GitHub (onde o site fica publicado)

### 8. Criar a conta e o repositório
1. Acesse **https://github.com** → **Sign up** (crie a conta, se não tiver).
2. Clique no **+** (canto superior direito) → **New repository**.
3. Nome: `estoqueplus` · deixe **Public** · marque **Add a README file** → **Create repository**.

### 9. Enviar os arquivos
1. **Descompacte** o `estoqueplus.zip` no computador.
2. No repositório, clique em **Add file** → **Upload files**.
3. Abra a pasta descompactada, selecione **todos os arquivos de dentro dela** (index.html, app.js, styles.css, firebase-config.js, cartao.js, importar-planilha.js, tutor.html, tutor.js…) e **arraste** para a página.
   ⚠️ Arraste os arquivos, não a pasta, e nem o .zip.
4. Lá embaixo, clique em **Commit changes**.

### 10. Ligar o site
1. No repositório: **Settings** → **Pages** (menu da esquerda).
2. Em *Source*: **Deploy from a branch** · Branch: **main** · pasta **/ (root)** → **Save**.
3. Espere 1–2 minutos e atualize a página: aparece **"Your site is live at https://SEU-USUARIO.github.io/estoqueplus/"**.

### 11. Autorizar o endereço do site no Firebase
1. Volte ao Firebase → **Authentication** → aba **Configurações** → **Domínios autorizados** → **Adicionar domínio**.
2. Digite `SEU-USUARIO.github.io` (sem https e sem /estoqueplus) → **Adicionar**.

---

## PARTE 3 — Primeiro uso

12. Abra `https://SEU-USUARIO.github.io/estoqueplus/` e entre com o seu e-mail e senha → o sistema cria seu perfil **master**.
13. **1 · Estoque → 📥 Importar planilha da clínica** → escolha `Controle_Estoque_e_Patrimonio.xlsx` → confira o resumo e os avisos → **Importar**.
14. **⚙️ Usuários** → crie a estoquista (perfil *estoquista*) e a equipe (perfil *usuário*).
15. **4 · Pedidos → Fornecedores** → cadastre os fornecedores de cada categoria.
16. Nos produtos: coloque as **fotos** (botão 🔎 Buscar foto no Google), a **quantidade ideal/mínima** e as **validades** na primeira conferência.

---

## Quando algo não funcionar
- **"Usuário sem acesso"** → o e-mail do login não é igual ao `MASTER_EMAIL` e ao das regras.
- **"Missing or insufficient permissions"** → as regras não foram publicadas (passo 5) ou o e-mail nelas está diferente.
- **Tela de login não entra / erro de domínio** → faltou o passo 11.
- **Mensagem com um link "create index"** → clique no link, depois em **Criar** e espere uns minutos.
- **Mudei um arquivo** → no GitHub, abra o arquivo → ✏️ (editar) → cole → **Commit changes**. O site atualiza em 1–2 minutos.
