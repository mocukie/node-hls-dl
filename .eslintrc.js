module.exports = {
    "env": {
        "es6": true,
        "node": true
    },
    "extends": "eslint:recommended",
    "parserOptions": {
        "ecmaVersion": 2017,
        "sourceType": "module"
    },
    "rules": {
        "indent": [
            "error",
            4
        ],
        "quotes": [
            "error",
            "single"
        ],
        "semi": [
            "error",
            "always"
        ],
        "space-before-function-paren": [
            "error",
            "always"
        ],
        "keyword-spacing": [
            "error", 
            {
                "before": true,
                "after": true
            }
        ],
        "space-before-blocks": [
            "error",
            "always"
        ],
        "no-console": "off",
        "no-unused-vars": "off",
        "no-cond-assign": "off"
    }
};