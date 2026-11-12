const eslintConfig = [
	{
		ignores: [".next/**", "out/**", "build/**", "archive/**", "next-env.d.ts"],
	},
	{
		rules: {
			"no-unused-vars": "warn",
			"no-console": "off",
		},
	},
];

export default eslintConfig;
