{{- define "paymasterSupervisor.fullname" -}}
{{- printf "%s-%s" .Release.Name "paymaster-supervisor" | trunc 63 | trimSuffix "-" -}}
{{- end -}}
