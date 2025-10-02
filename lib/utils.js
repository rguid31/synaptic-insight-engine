export const transformStructuredData = (data) => {
    if (!data || !Array.isArray(data)) {
        return {};
    }
    return data.reduce((obj, item) => {
        if (item && item.section) {
            obj[item.section] = item.content;
        }
        return obj;
    }, {});
};