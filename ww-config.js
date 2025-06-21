export default {
  name: "RealtimeChat",
  componentId: "realtime-chat",
  label: {
    en: "Realtime Chat",
    pt: "Chat em Tempo Real"
  },
  icon: "chat",
  customSettingsPropertiesOrder: [
    "supabaseUrl",
    "supabaseKey",
    "tableName",
    "channelId",
    "currentUserId",
    "currentUsername",
    "mentionTriggers"
  ],
  properties: {
    supabaseUrl: {
      label: {
        en: "Supabase URL",
        pt: "URL do Supabase"
      },
      type: "Text",
      defaultValue: "",
      bindable: true,
      required: true,
      placeholder: "https://seu-projeto.supabase.co"
    },
    supabaseKey: {
      label: {
        en: "Supabase Anon Key",
        pt: "Chave Anon do Supabase"
      },
      type: "Text",
      defaultValue: "",
      bindable: true,
      required: true,
      placeholder: "sua-anon-key",
      password: true
    },
    tableName: {
      label: {
        en: "Table Name",
        pt: "Nome da Tabela"
      },
      type: "Text",
      defaultValue: "messages",
      bindable: true
    },
    channelId: {
      label: {
        en: "Channel ID",
        pt: "ID do Canal"
      },
      type: "Text",
      defaultValue: "general",
      bindable: true,
      required: true
    },
    currentUserId: {
      label: {
        en: "Current User ID",
        pt: "ID do Usuário Atual"
      },
      type: "Text",
      defaultValue: "",
      bindable: true,
      required: true
    },
    currentUsername: {
      label: {
        en: "Current Username",
        pt: "Nome do Usuário Atual"
      },
      type: "Text",
      defaultValue: "",
      bindable: true,
      required: true
    },
    mentionTriggers: {
      label: {
        en: "Mention Triggers Configuration",
        pt: "Configuração de Menções"
      },
      type: "Object",
      defaultValue: {
        "@": {
          items: [],
          className: "mention-user"
        },
        "#": {
          items: [],
          className: "mention-tag"
        }
      },
      bindable: true,
      options: {
        expandable: true
      }
    },
    height: {
      label: {
        en: "Height",
        pt: "Altura"
      },
      type: "Length",
      defaultValue: "500px",
      bindable: true
    }
  }
}