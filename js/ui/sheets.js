export const openModal = (id) => {
    document.body.classList.add('modal-open');
    document.getElementById('modal-backdrop').classList.remove('hidden');
    document.getElementById(id).classList.remove('hidden');
};

export const closeModal = () => {
    document.body.classList.remove('modal-open');
    document.getElementById('modal-backdrop').classList.add('hidden');
    document.querySelectorAll('.sheet').forEach(m => m.classList.add('hidden'));
};

export const bindSheetChrome = () => {
    document.getElementById('modal-backdrop').onclick = (e) => {
        if (e.target === document.getElementById('modal-backdrop')) closeModal();
    };
    document.querySelectorAll('.close-modal').forEach(el => el.onclick = closeModal);
};
