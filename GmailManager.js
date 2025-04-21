export class GmailManager {
    constructor(websocketManager, speechManager) {
        this.websocket = websocketManager;
        this.speech = speechManager;
        this.tokenClient = null;
        this.gapiInited = false;
        this.gisInited = false;
        this.gmailCommandAttempts = 0;
        this.MAX_GMAIL_COMMAND_ATTEMPTS = 3;
        this.authHandled = false;
    }

    async checkForOAuthCallback() {
        if (window.location.hash.includes('access_token')) {
            const params = new URLSearchParams(window.location.hash.substring(1));
            const accessToken = params.get('access_token');
            const state = params.get('state');
            if (accessToken && state) {
                await this.handleOAuthCallback(accessToken, state);
                history.replaceState(null, null, ' ');
            }
        }
    }

    async initiateGmailAuth() {
        console.log("Starting Gmail authentication process");
        const accessToken = localStorage.getItem('gmail_access_token');
        
        if (!accessToken) {
            console.log("No access token found, initiating OAuth flow");
            
            const clientId = '833397170915-hu6iju9klda3tio75sc8sgr01mpi74lq.apps.googleusercontent.com';
            const redirectUri = encodeURIComponent('https://rentahal.com/static/oauth-callback.html');
            const scope = encodeURIComponent('https://www.googleapis.com/auth/gmail.readonly');
            const state = encodeURIComponent(this.generateRandomState());

            const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
                `client_id=${clientId}&` +
                `redirect_uri=${redirectUri}&` +
                `response_type=token&` +
                `scope=${scope}&` +
                `state=${state}&` +
                `include_granted_scopes=true`;

            const authWindow = window.open(authUrl, 'Gmail Authorization', 'width=600,height=600');
            
            if (authWindow) {
                window.addEventListener('message', async (event) => {
                    if (event.origin !== "https://rentahal.com") {
                        console.warn("Unexpected origin for OAuth callback");
                        return;
                    }

                    if (event.data.type === 'OAUTH_CALLBACK') {
                        console.log("Received OAuth callback");
                        if (event.data.accessToken) {
                            localStorage.setItem('gmail_access_token', event.data.accessToken);
                            await this.handleGmailAuthSuccess();
                        }
                    }

                    if (event.data.type === 'OAUTH_CLOSE_WINDOW') {
                        authWindow.close();
                    }
                }, false);
            } else {
                console.error("Could not open authorization window");
                await this.speech.speakFeedback("Could not open Gmail authorization window. Please check your popup blocker.");
            }
        } else {
            console.log("Using existing access token");
            await this.handleGmailAuthSuccess();
        }
    }

    generateRandomState() {
        return Math.random().toString(36).substring(2, 15) + 
               Math.random().toString(36).substring(2, 15);
    }

    async handleOAuthCallback(accessToken, state) {
        if (this.authHandled) return;
        this.authHandled = true;

        try {
            await this.loadGmailApi();
            await this.handleGmailAuthSuccess();
        } catch (error) {
            console.error("Error in OAuth callback:", error);
            this.handleGmailAuthFailure();
        }
    }

    async handleGmailAuthSuccess() {
        try {
            await this.loadGmailApi();
            console.log("Gmail API loaded successfully");
            await this.speech.speakFeedback("Gmail ready. Starting to read your emails.");
            await this.startReadingEmails();
        } catch (error) {
            console.error("Error loading Gmail API:", error);
            await this.speech.speakFeedback(`Error initializing Gmail: ${error.message || error}. Please try again later.`);
        }
    }

    handleGmailAuthFailure() {
        this.speech.speakFeedback("I couldn't access your Gmail account. Please try again later.");
    }

    async loadGmailApi() {
        return new Promise((resolve, reject) => {
            if (!this.gapiInited) {
                gapi.load('client', async () => {
                    try {
                        await gapi.client.init({
                            apiKey: 'AIzaSyBYQtY9Y3GVOdQLBrySPOTEnpLXT7mJuGk',
                            discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/gmail/v1/rest'],
                        });
                        console.log("Gmail API initialized and loaded");
                        resolve();
                    } catch (error) {
                        console.error("Error initializing Gmail API:", error);
                        reject(error);
                    }
                });
            } else {
                gapi.client.load('gmail', 'v1', () => {
                    console.log("Gmail API loaded");
                    resolve();
                });
            }
        });
    }

    async startReadingEmails() {
        try {
            const emails = await this.readEmails();
            if (emails && emails.length > 0) {
                await this.readEmailsOneByOne(emails);
            } else {
                await this.speech.speakFeedback("No new emails found.");
            }
        } catch (error) {
            console.error("Error reading emails:", error);
            await this.speech.speakFeedback("An error occurred while reading your emails. Please try again later.");
        }
    }

    async readEmails() {
        console.log("Attempting to read emails");
        const accessToken = localStorage.getItem('gmail_access_token');
        if (!accessToken) {
            this.initiateGmailAuth();
            return;
        }

        try {
            if (!gapi.client.gmail) {
                await gapi.client.load('gmail', 'v1');
            }

            gapi.auth.setToken({ access_token: accessToken });

            const response = await gapi.client.gmail.users.messages.list({
                'userId': 'me',
                'maxResults': 20
            });

            const messages = response.result.messages;
            if (!messages || messages.length === 0) {
                console.log("No emails found");
                await this.speech.speakFeedback("No new emails found.");
                return [];
            }

            console.log("Emails found:", messages.length);
            const emailDetails = [];
            
            for (const message of messages) {
                const details = await this.getEmailDetails(message.id);
                emailDetails.push(details);
            }
            
            return emailDetails;
        } catch (error) {
            console.error('Error reading emails:', error);
            throw error;
        }
    }

    async getEmailDetails(messageId) {
        try {
            const response = await gapi.client.gmail.users.messages.get({
                'userId': 'me',
                'id': messageId
            });
            const message = response.result;
            const headers = message.payload.headers;
            const subject = headers.find(header => header.name === "Subject")?.value || "No subject";
            const from = headers.find(header => header.name === "From")?.value || "Unknown sender";
            return { subject, from };
        } catch (err) {
            console.error('Error getting email details:', err);
            return { subject: 'Error retrieving subject', from: 'Error retrieving sender' };
        }
    }

    async readEmailsOneByOne(emails) {
        let currentIndex = 0;

        while (currentIndex < emails.length) {
            const email = emails[currentIndex];
            console.log(`Reading email ${currentIndex + 1} of ${emails.length}`);

            await this.speech.speakFeedback(
                `Email ${currentIndex + 1} of ${emails.length}. From ${email.from}: Subject: ${email.subject}`
            );

            let awaitingCommand = true;
            while (awaitingCommand) {
                await this.speech.speakFeedback("Say 'next' for the next email or 'finish' to stop.");

                try {
                    const command = await this.waitForCommand();
                    
                    if (command === "timeout") {
                        await this.speech.speakFeedback("No command received. Please try again.");
                    } else if (command && command.includes("finish")) {
                        await this.speech.speakFeedback("Email reading finished. Returning to main menu.");
                        return;
                    } else if (command && command.includes("next")) {
                        currentIndex++;
                        awaitingCommand = false;
                    } else {
                        await this.speech.speakFeedback("Command not recognized. Please say 'next' or 'finish'.");
                    }
                } catch (error) {
                    console.error("Error waiting for command:", error);
                    await this.speech.speakFeedback("Error processing command. Please try again.");
                }
            }
        }

        await this.speech.speakFeedback("All emails have been read. Returning to main menu.");
    }

    waitForCommand(timeout = 20000) {
        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                resolve("timeout");
            }, timeout);

            const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
            recognition.continuous = false;
            recognition.interimResults = false;

            recognition.onresult = (event) => {
                clearTimeout(timer);
                const last = event.results.length - 1;
                const command = event.results[last][0].transcript.trim().toLowerCase();
                resolve(command);
            };

            recognition.onerror = () => {
                clearTimeout(timer);
                resolve("error");
            };

            recognition.start();
        });
    }

    handleGmailSignout() {
        localStorage.removeItem('gmail_access_token');
        console.log("User signed out of Gmail");
    }
}
