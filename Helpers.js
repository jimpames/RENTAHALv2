export const helpers = {
    escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    },

    generateRandomState() {
        return Math.random().toString(36).substring(2, 15) + 
               Math.random().toString(36).substring(2, 15);
    },

    getWorkerStatusClass(worker) {
        if (worker.is_blacklisted) return 'bg-black text-white';
        if (worker.health_score < 50) return 'bg-red-200';
        if (worker.health_score < 80) return 'bg-yellow-200';
        return 'bg-green-200';
    },

    formatTimestamp(timestamp) {
        return new Date(timestamp).toLocaleString();
    },

    formatCost(cost) {
        return `$${cost.toFixed(4)}`;
    },

    formatProcessingTime(time) {
        return `${time.toFixed(2)}s`;
    },

    checkForWeapons(visionResponse) {
        const weaponKeywords = ['knife', 'gun', 'weapon', 'firearm', 'blade'];
        const lowercaseResponse = visionResponse.toLowerCase();
        return weaponKeywords.some(keyword => lowercaseResponse.includes(keyword));
    },

    isImageType(resultType) {
        return resultType === 'image';
    },

    isAudioType(resultType) {
        return resultType === 'audio';
    },

    validateForm(queryType, promptInput, imageUpload, audioChunks) {
        if (queryType === 'speech' && audioChunks.length === 0) {
            return { isValid: false, error: 'Please record your voice query before submitting.' };
        }
        if (queryType !== 'speech' && promptInput.trim() === '') {
            return { isValid: false, error: 'Please enter a prompt' };
        }
        if (queryType === 'vision' && !imageUpload.files[0]) {
            return { isValid: false, error: 'Please upload an image for vision queries' };
        }
        return { isValid: true };
    },

    showTooltip(element, message) {
        const tooltip = document.createElement('div');
        tooltip.textContent = message;
        tooltip.className = 'absolute bg-gray-800 text-white p-2 rounded text-sm z-10';
        element.appendChild(tooltip);
        setTimeout(() => tooltip.remove(), 3000);
    },

    adjustLayoutForScreenSize() {
        const mainContent = document.querySelector('main');
        if (mainContent) {
            if (window.innerWidth < 768) {
                mainContent.classList.remove('grid', 'grid-cols-2', 'gap-4');
                mainContent.classList.add('flex', 'flex-col');
            } else {
                mainContent.classList.add('grid', 'grid-cols-2', 'gap-4');
                mainContent.classList.remove('flex', 'flex-col');
            }
        }
    }
};
