import { parseLocalDate } from './dates.js';

export const formatCurrency = (amount) =>
    new Intl.NumberFormat('en-IN', {
        style: 'currency', currency: 'INR', maximumFractionDigits: 0
    }).format(amount);

export const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Intl.DateTimeFormat('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric'
    }).format(parseLocalDate(dateString));
};
